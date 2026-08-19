import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pack } from './file-scope-fixtures.mjs';
import { Done, NeedsHuman } from '../boundary.mjs';
import { indexUnits, runEngine } from '../engine.mjs';
import { appendJournalLine, writeGenesis } from '../journal-store.mjs';
import { foldRunManifest } from '../run-log.mjs';

function harness(runUnit) {
  const calls = [];
  return {
    calls,
    ports: {
      runUnit,
      writeGenesis: async (request) => { calls.push({ port: 'writeGenesis', value: request }); },
      appendJournal: async (request) => { calls.push({ port: 'appendJournal', value: request }); },
      writeRef: async (request) => { calls.push({ port: 'writeRef', value: request }); },
      gh: async (argv) => { calls.push({ port: 'gh', value: argv }); return { state: 'OPEN' }; },
    },
  };
}

function baseRequest(overrides = {}) {
  return {
    specs: [
      { id: 'alpha', fileScope: pack(['alpha.mjs']) },
      { id: 'beta', prereqs: ['alpha'], fileScope: pack(['beta.mjs']) },
      { id: 'gamma', fileScope: pack(['gamma.mjs']) },
    ],
    runId: '0a1b2c3d',
    at: '2026-08-15T12:00:00Z',
    repoRoot: '/repo',
    journalPath: '.mitosis/run.jsonl',
    manifest: { logicalRunId: 'r1', clusters: [], msps: [{ id: 'm1' }] },
    repoSlug: 'acme/widgets',
    integrationBranch: 'integration',
    ...overrides,
  };
}

const ENGINE_RESULT_KEYS = Object.freeze(['aborted', 'quiescent', 'recorded', 'ticks', 'units']);
const CANDIDATE_PORTS = Object.freeze(['runUnit', 'writeGenesis', 'appendJournal', 'writeRef', 'gh']);
const REQUIRED_PORT_NAMES = Object.freeze(['runUnit', 'writeGenesis', 'appendJournal', 'writeRef']);

async function refusesMissingPort(ports, name) {
  try {
    await runEngine(baseRequest(), ports);
    return false;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return new RegExp(name).test(error.message);
  }
}

function journalRecords(calls) {
  return calls.filter((c) => c.port === 'appendJournal').map((c) => JSON.parse(c.value.line));
}

function lastIndexOfPort(calls, port) {
  return calls.map((c, i) => (c.port === port ? i : -1)).filter((i) => i !== -1).pop();
}

test('END TO END: a fixture spec runs to quiescence against a stubbed dispatch and produces the expected journal and refs, and probes no pull request', async () => {
  const runUnit = async (unit) => {
    if (unit.id === 'alpha') return Done({ sha: 'sha-alpha', green: true });
    if (unit.id === 'beta') return Done({ sha: 'sha-beta', green: true });
    return NeedsHuman({ kind: 'ask', what: 'need input' }, ['t1']);
  };
  const h = harness(runUnit);
  const request = baseRequest();
  const result = await runEngine(request, h.ports);

  assert.equal(h.calls[0].port, 'writeGenesis', 'the first call into any port is writeGenesis');
  assert.deepEqual(h.calls[0].value, { repoRoot: '/repo', path: '.mitosis/run.jsonl', manifest: request.manifest });

  const writeRefCalls = h.calls.filter((c) => c.port === 'writeRef');
  assert.equal(writeRefCalls.length, 2, 'exactly the two done units get a checkpoint ref written');
  assert.deepEqual(
    writeRefCalls.map((c) => c.value.ref).sort(),
    ['refs/mitosis/0a1b2c3d/alpha', 'refs/mitosis/0a1b2c3d/beta'],
  );
  const alphaRef = writeRefCalls.find((c) => c.value.ref === 'refs/mitosis/0a1b2c3d/alpha');
  assert.equal(alphaRef.value.sha, 'sha-alpha');
  assert.ok(!writeRefCalls.some((c) => c.value.ref.includes('gamma')), 'the parked unit never gets a checkpoint ref');

  const records = journalRecords(h.calls);
  const alphaBuilt = records.filter((r) => r.kind === 'built' && r.unitId === 'alpha');
  assert.equal(alphaBuilt.length, 1, 'exactly one built record for alpha');
  assert.equal(alphaBuilt[0].checkpointRef, 'refs/mitosis/0a1b2c3d/alpha');
  assert.equal(alphaBuilt[0].sha, 'sha-alpha');
  assert.deepEqual(
    Object.keys(alphaBuilt[0]),
    ['kind', 'unitId', 'checkpointRef', 'sha', 'builtAgainst'],
    'the journalled built record carries exactly these fields',
  );

  const betaBuilt = records.filter((r) => r.kind === 'built' && r.unitId === 'beta');
  assert.equal(betaBuilt.length, 1, 'exactly one built record for beta');

  const gammaPark = records.filter((r) => r.kind === 'park' && r.unitId === 'gamma');
  assert.equal(gammaPark.length, 1, 'exactly one park record for gamma');
  assert.deepEqual(gammaPark[0].triedSet, ['t1']);

  assert.ok(!records.some((r) => r.kind === 'ship'), 'the fresh path must not write a ship checkpoint');

  const lastRecord = records[records.length - 1];
  assert.equal(lastRecord.kind, 'quiescent-exit');
  assert.equal(lastRecord.at, '2026-08-15T12:00:00Z');
  assert.equal(lastRecord.outstanding, true);

  assert.deepEqual(h.calls.filter((c) => c.port === 'gh'), [], 'the engine drives no gh port: it measures no pull-request state');
  assert.equal(lastIndexOfPort(h.calls, 'appendJournal'), h.calls.length - 1, 'the quiescent-exit write is the last port call the engine makes');

  assert.equal(result.quiescent, true);
  assert.equal(result.aborted, false);
  assert.equal(indexUnits(result.units).get('gamma').state, 'parked');
});

test('OUTSTANDING IS FALSE WHEN EVERY UNIT REACHES DONE', async () => {
  const runUnit = async () => Done({ sha: 'x', green: true });
  const h = harness(runUnit);
  const request = baseRequest();
  await runEngine(request, h.ports);

  const records = journalRecords(h.calls);
  const lastRecord = records[records.length - 1];
  assert.equal(lastRecord.kind, 'quiescent-exit');
  assert.equal(lastRecord.outstanding, false);
});

test('ABORT WRITES NO QUIESCENT-EXIT LINE AND MAKES NO PR CALL', async () => {
  const controller = new AbortController();
  let hasAborted = false;
  const runUnit = async () => {
    if (!hasAborted) {
      hasAborted = true;
      controller.abort();
    }
    return Done({ sha: 's' });
  };
  const h = harness(runUnit);
  const request = baseRequest({ signal: controller.signal });
  const result = await runEngine(request, h.ports);

  assert.equal(result.aborted, true);
  assert.equal(result.quiescent, false);

  const records = journalRecords(h.calls);
  assert.ok(!records.some((r) => r.kind === 'quiescent-exit'), 'no quiescent-exit line is written on an aborted exit');
  assert.ok(!h.calls.some((c) => c.port === 'gh'), 'no gh call is made on an aborted exit');
});

test('THE INSTANT ARRIVES AS AN ARGUMENT: a request whose at is not an ISO 8601 instant is refused before any port is called', async () => {
  const h = harness(async () => Done({ sha: 'x' }));
  await assert.rejects(
    runEngine(baseRequest({ at: 'yesterday' }), h.ports),
    (error) => error instanceof TypeError && /ISO 8601 instant/.test(error.message),
  );
  assert.equal(h.calls.length, 0, 'no port is called before the malformed request is refused');
});

test('A MISSING PORT IS REFUSED BEFORE ANY WORK STARTS, and the required set is exactly the four ports the engine drives', async () => {
  const required = [];
  for (const name of CANDIDATE_PORTS) {
    const ports = { ...harness(async () => Done({ sha: 'x' })).ports };
    delete ports[name];
    if (await refusesMissingPort(ports, name)) required.push(name);
  }
  assert.deepEqual(
    required,
    [...REQUIRED_PORT_NAMES],
    'the engine requires exactly these ports; gh is absent because the engine opens no pull-request probe of its own',
  );
});

test('THE ENGINE RESULT CARRIES NO prState KEY on either the quiescent or the non-quiescent exit', async () => {
  const quiescentHarness = harness(async () => Done({ sha: 'sha-x' }));
  const quiescent = await runEngine(baseRequest(), quiescentHarness.ports);
  assert.equal(quiescent.quiescent, true, 'the fixture request must reach quiescence for this to exercise the quiescent exit');
  assert.equal(Object.hasOwn(quiescent, 'prState'), false, 'the quiescent exit must carry no prState key');
  assert.deepEqual(Object.keys(quiescent).sort(), [...ENGINE_RESULT_KEYS], 'the quiescent exit carries exactly these result fields');

  const controller = new AbortController();
  let hasAborted = false;
  const abortHarness = harness(async () => {
    if (!hasAborted) {
      hasAborted = true;
      controller.abort();
    }
    return Done({ sha: 'sha-x' });
  });
  const nonQuiescent = await runEngine(baseRequest({ signal: controller.signal }), abortHarness.ports);
  assert.equal(nonQuiescent.quiescent, false, 'the aborted request must not reach quiescence for this to exercise the non-quiescent exit');
  assert.equal(nonQuiescent.aborted, true);
  assert.equal(Object.hasOwn(nonQuiescent, 'prState'), false, 'the non-quiescent exit must carry no prState key');
  assert.deepEqual(Object.keys(nonQuiescent).sort(), [...ENGINE_RESULT_KEYS], 'the non-quiescent exit carries exactly these result fields');
});

test('a checkpoint write that throws a bare Error records its own message rather than the stringified error', async () => {
  const runUnit = async () => Done({ sha: 'sha-x', green: true });
  const h = harness(runUnit);
  const records = [];
  const ports = { ...h.ports, writeRef: async () => { throw new Error('ENOENT: no such ref'); } };
  const request = baseRequest({ onRecord: (record) => records.push(record) });
  await runEngine(request, ports);
  const failure = records.find((r) => r.id === 'alpha' && r.outcome === 'post-dispatch-record-failed');
  assert.ok(failure, 'no post-dispatch-record-failed record was observed for alpha');
  assert.equal(
    failure.reason,
    'engine: the unit was dispatched and its cost is already billed, but the checkpoint or journal write that follows it failed: ENOENT: no such ref',
  );
});

test('a checkpoint write that throws a valueless failure is described as unknown rather than losing the record', async () => {
  const runUnit = async () => Done({ sha: 'sha-x', green: true });
  const h = harness(runUnit);
  const records = [];
  const ports = { ...h.ports, writeRef: async () => { throw undefined; } };
  const request = baseRequest({ onRecord: (record) => records.push(record) });
  await runEngine(request, ports);
  const failure = records.find((r) => r.id === 'alpha' && r.outcome === 'post-dispatch-record-failed');
  assert.ok(failure, 'no post-dispatch-record-failed record was observed for alpha');
  assert.equal(
    failure.reason,
    'engine: the unit was dispatched and its cost is already billed, but the checkpoint or journal write that follows it failed: unknown failure',
  );
});

function realJournalPorts(runUnit) {
  return {
    runUnit,
    writeGenesis: async (request) => writeGenesis(request),
    appendJournal: async (request) => appendJournalLine(request),
    writeRef: async () => {},
    gh: async () => ({ state: 'OPEN' }),
  };
}

test('APPEND-ONLY JOURNAL: two consecutive runEngine invocations over one journal path keep every line the first one wrote, and the fold of the combined journal equals folding the first invocation then applying the second invocation deltas', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'engine-journal-append-'));
  try {
    const journalPath = join(dir, '.mitosis', 'run.json');
    const specs = [{ id: 'alpha', fileScope: pack(['alpha.mjs']) }, { id: 'beta', fileScope: pack(['beta.mjs']) }];
    const genesisManifest = { logicalRunId: 'r1', clusters: [], msps: [{ id: 'alpha' }, { id: 'beta' }] };
    const request1 = {
      specs,
      runId: '0a1b2c3d',
      at: '2026-08-15T12:00:00Z',
      repoRoot: dir,
      journalPath,
      manifest: genesisManifest,
      repoSlug: 'acme/widgets',
      integrationBranch: 'integration',
    };
    await runEngine(request1, realJournalPorts(async () => Done({ sha: 'sha-invocation-one', green: true })));
    const afterFirstInvocation = readFileSync(journalPath, 'utf8');
    const firstLines = afterFirstInvocation.split('\n').filter((line) => line.length > 0);
    assert.equal(firstLines.length, 4, 'the first invocation should have written a genesis line, one built delta per unit and a quiescent-exit line');

    const foldedFirst = foldRunManifest(afterFirstInvocation);
    assert.ok(foldedFirst, 'the first invocation journal must fold to a manifest before it seeds the second invocation');
    const request2 = { ...request1, at: '2026-08-15T13:00:00Z', manifest: foldedFirst };
    await runEngine(request2, realJournalPorts(async () => Done({ sha: 'sha-invocation-two', green: true })));
    const wholeJournal = readFileSync(journalPath, 'utf8');
    const wholeLines = wholeJournal.split('\n').filter((line) => line.length > 0);

    for (const line of firstLines) {
      assert.ok(wholeLines.includes(line), `a line the first invocation wrote is missing after the second invocation: ${line}`);
    }

    const secondGenesisLine = JSON.stringify(foldedFirst);
    assert.notEqual(wholeLines.indexOf(secondGenesisLine), -1, 'the second invocation genesis line is missing from the whole journal');
    const secondGenesisIndex = wholeLines.indexOf(secondGenesisLine, firstLines.length);
    assert.equal(secondGenesisIndex, firstLines.length, 'the second invocation genesis line must sit immediately after every line the first invocation wrote');
    const secondInvocationDeltaLines = wholeLines.slice(secondGenesisIndex + 1);
    assert.equal(secondInvocationDeltaLines.length, 3, 'the second invocation must have appended one built delta per unit and a quiescent-exit line');

    const wholeFolded = foldRunManifest(wholeJournal);
    const firstFoldedThenSecondDeltasApplied = foldRunManifest(
      `${afterFirstInvocation}${secondInvocationDeltaLines.map((line) => `${line}\n`).join('')}`,
    );
    assert.deepEqual(
      wholeFolded,
      firstFoldedThenSecondDeltasApplied,
      'the fold of the two-invocation journal must equal folding the first invocation then applying the second invocation deltas',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('A MALFORMED RUN REQUEST IS REFUSED: specs must be an array and runId, repoRoot, journalPath, repoSlug and integrationBranch must be non-empty strings', async () => {
  const h = harness(async () => Done({ sha: 'x' }));
  await assert.rejects(
    runEngine({ specs: 'nope' }, h.ports),
    (error) => error instanceof TypeError && /specs/.test(error.message),
  );
  for (const field of ['runId', 'repoRoot', 'journalPath', 'repoSlug', 'integrationBranch']) {
    await assert.rejects(
      runEngine(baseRequest({ [field]: '' }), h.ports),
      (error) => error instanceof TypeError && new RegExp(field).test(error.message),
      `an empty ${field} must be refused with a message naming ${field}`,
    );
  }
});
