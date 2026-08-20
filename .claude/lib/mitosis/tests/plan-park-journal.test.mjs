import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realPorts } from '../cli.mjs';
import { runEngine } from '../engine.mjs';

const PLANNED_DISPATCH_FAILURE = Object.freeze({
  approved: false,
  what: 'plan-dispatch-failed',
  detail: 'the plan child returned "exit-nonzero": dispatch: the child exited 1; HTTP 429; the child said: billing hit its monthly spend cap',
  findings: Object.freeze([]),
  planPath: '/repo/.mitosis/plans/0a1b2c3d/alpha.md',
  iterations: 1,
  envelope: Object.freeze({ api_error_status: 429 }),
});

function baseRequest(journalled) {
  return {
    request: {
      specs: [{ id: 'alpha', prereqs: [] }],
      manifest: {},
      runId: '0a1b2c3d',
      at: '2026-08-15T12:00:00Z',
      repoRoot: '/repo',
      journalPath: '.mitosis/run.jsonl',
      repoSlug: 'acme/widgets',
      integrationBranch: 'integration',
    },
    ports: {
      writeGenesis: async () => {},
      appendJournal: async (line) => { journalled.push(JSON.parse(line.line)); },
      writeRef: async () => {},
    },
  };
}

test('PLAN PARK JOURNAL: a plan-stage dispatch failure carries its HTTP status and the child\'s own words from cli.mjs planPark into the engine park journal record', async () => {
  const cliPorts = realPorts({
    repoRoot: '/repo',
    requestsById: new Map([['alpha', { prompt: 'do alpha' }]]),
    planById: new Map([['alpha', PLANNED_DISPATCH_FAILURE]]),
  }, { dispatch: async () => { throw new Error('a planned unit must park before any dispatch is attempted'); } });

  const parkOutcome = await cliPorts.runUnit({ id: 'alpha' }, { signal: null });
  assert.equal(parkOutcome.tag, 'NeedsHuman');
  assert.equal(parkOutcome.request.detail.includes('HTTP 429'), true);
  assert.equal(parkOutcome.request.detail.includes('billing hit its monthly spend cap'), true);
  assert.equal(parkOutcome.envelope.api_error_status, 429);

  const journalled = [];
  const { request, ports } = baseRequest(journalled);
  await runEngine(request, { runUnit: cliPorts.runUnit, ...ports });

  const parkLines = journalled.filter((line) => line.kind === 'park' && line.unitId === 'alpha');
  assert.equal(parkLines.length, 1);
  const [record] = parkLines;
  assert.equal(record.request.detail.includes('HTTP 429'), true, 'the composed detail carries the status onto disk');
  assert.equal(record.request.detail.includes('billing hit its monthly spend cap'), true, 'the composed detail carries the child\'s own words onto disk');
  assert.equal(record.envelope.api_error_status, 429, 'the structured envelope also reaches the journal record, not only the composed text');
});
