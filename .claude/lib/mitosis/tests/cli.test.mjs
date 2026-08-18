import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pack } from './file-scope-fixtures.mjs';
import { CLI_USAGE, exitCodeOf, parseCliArgv, realPorts, runCli } from '../cli.mjs';
import { Done, NeedsHuman } from '../boundary.mjs';

function fullArgv(extra = [], root = '/repo') {
  return [
    '--spec', '/spec.json',
    '--run-id', '0a1b2c3d',
    '--at', '2026-08-15T12:00:00Z',
    '--repo-root', root,
    '--journal', '.mitosis/run.jsonl',
    '--repo-slug', 'acme/widgets',
    '--integration-branch', 'integration',
    ...extra,
  ];
}

function tempArgv(t) {
  const root = mkdtempSync(join(tmpdir(), 'mitosis-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return fullArgv([], root);
}

function withoutFlag(argv, flag) {
  const index = argv.indexOf(flag);
  return [...argv.slice(0, index), ...argv.slice(index + 2)];
}

function specDocument(unitOutcomes) {
  return {
    manifest: { logicalRunId: 'r1', clusters: [], msps: [{ id: 'm1' }] },
    specs: [{ id: 'alpha', fileScope: pack(['alpha.mjs']), request: { prompt: 'do alpha' } }],
  };
}

function stubIo(spec) {
  const out = [];
  const errOut = [];
  return {
    out,
    errOut,
    log: (text) => { out.push(text); },
    err: (text) => { errOut.push(text); },
    readSpec: () => spec,
  };
}

function stubPorts(runUnit) {
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

test('ARGV PARSE: a full argument vector yields every field the engine needs', () => {
  const parsed = parseCliArgv(fullArgv());
  assert.equal(parsed.ok, true);
  const value = parsed.value;
  assert.equal(value.spec, '/spec.json');
  assert.equal(value.runId, '0a1b2c3d');
  assert.equal(value.at, '2026-08-15T12:00:00Z');
  assert.equal(value.repoRoot, '/repo');
  assert.equal(value.journalPath, '.mitosis/run.jsonl');
  assert.equal(value.repoSlug, 'acme/widgets');
  assert.equal(value.integrationBranch, 'integration');
  assert.equal(value.window, undefined);
});

test('ARGV PARSE: --window is accepted only as a positive integer', () => {
  const accepted = parseCliArgv(fullArgv(['--window', '4']));
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.window, 4);

  for (const token of ['0', 'x', '-1']) {
    const rejected = parseCliArgv(fullArgv(['--window', token]));
    assert.equal(rejected.ok, false);
    assert.match(rejected.error, /positive integer|not a flag|needs one non-empty value/);
  }
});

test('ARGV PARSE: a missing, unknown, repeated or valueless flag is refused', () => {
  const missingAt = parseCliArgv(withoutFlag(fullArgv(), '--at'));
  assert.equal(missingAt.ok, false);
  assert.match(missingAt.error, /--at/);

  const unknownFlag = parseCliArgv(fullArgv(['--nope', 'value']));
  assert.equal(unknownFlag.ok, false);
  assert.match(unknownFlag.error, /--nope/);

  const repeatedFlag = parseCliArgv(fullArgv(['--spec', '/other.json']));
  assert.equal(repeatedFlag.ok, false);
  assert.match(repeatedFlag.error, /--spec/);

  const valuelessFlag = parseCliArgv([...withoutFlag(fullArgv(), '--spec'), '--spec']);
  assert.equal(valuelessFlag.ok, false);
  assert.match(valuelessFlag.error, /--spec/);
});

test('USAGE EXIT: a parse failure writes the usage line and exits 2 without reading the spec', async () => {
  const io = stubIo(specDocument());
  const makePorts = () => { throw new Error('makePorts must not be called on a usage failure'); };
  const code = await runCli(['--bogus'], io, makePorts);
  assert.equal(code, 2);
  assert.ok(io.errOut.join('').includes(CLI_USAGE));
  assert.deepEqual(io.out, []);
});

test('THE INSTANT ARRIVES AS ARGV: the --at value is the at the engine writes into the quiescent-exit record', async (t) => {
  const io = stubIo(specDocument());
  const stub = stubPorts(async () => Done({ sha: 'sha-alpha' }));
  const code = await runCli(tempArgv(t), io, () => stub.ports);
  const appendCalls = stub.calls.filter((call) => call.port === 'appendJournal');
  const lastRecord = JSON.parse(appendCalls[appendCalls.length - 1].value.line);
  assert.equal(lastRecord.kind, 'quiescent-exit');
  assert.equal(lastRecord.at, '2026-08-15T12:00:00Z');
  assert.equal(code, 3, 'this spec declares no base branch, so alpha is built and parked at Integrate and no pull request is opened; a run that built and shipped nothing is not a clean run');
});

test('EXIT 3: a run that reaches quiescence with a unit short of done reports incomplete', async (t) => {
  const io = stubIo(specDocument());
  const stub = stubPorts(async () => NeedsHuman({ kind: 'ask' }, []));
  const code = await runCli(tempArgv(t), io, () => stub.ports);
  assert.equal(code, 3);
  assert.match(io.out.join(''), /"state": "parked"/);
});

test('EXIT 3: a run that built every unit and opened no pull request is never reported clean', async (t) => {
  const io = stubIo(specDocument());
  const stub = stubPorts(async () => Done({ sha: 'sha-alpha' }));
  const code = await runCli(tempArgv(t), io, () => stub.ports);
  const summary = JSON.parse(io.out.join(''));
  assert.deepEqual(summary.units, [{ id: 'alpha', state: 'done' }], 'every unit reached done, which is all the unit disposition alone can see');
  assert.deepEqual(summary.ship.opened, [], 'the run opened no pull request at all');
  assert.equal(code, 3, 'an operator reading 0 here would be told a run that shipped nothing had succeeded');
});

function drivenRun(ship, integrateOutcomes = [], execute = {}) {
  return {
    phases: {
      Execute: { result: { quiescent: true, units: [{ id: 'alpha', state: 'done' }], ...execute } },
      Integrate: { outcomes: integrateOutcomes },
      Ship: ship,
    },
  };
}

const BUILT_UNIT_OUTCOME = Object.freeze([Object.freeze({ unitId: 'alpha', state: 'parked' })]);

test('EXIT MAPPING: shipping decides the code once the build is clean, and a hand-off awaiting a human merge is a success', () => {
  assert.equal(exitCodeOf(drivenRun({ status: 'all-shipped', outcomes: BUILT_UNIT_OUTCOME }, BUILT_UNIT_OUTCOME)), 0);
  assert.equal(
    exitCodeOf(drivenRun({ status: 'awaiting-approval', outcomes: BUILT_UNIT_OUTCOME }, BUILT_UNIT_OUTCOME)),
    0,
    'the engine never merges by design, so a run that opened its pull requests and waits on a human is the healthy terminal state; a red code here would train the operator to ignore the code',
  );
  assert.equal(
    exitCodeOf(drivenRun({ status: 'partial', outcomes: [] }, [])),
    0,
    'nothing was pending to integrate and nothing was pending to ship, so the unconditional partial a zero total produces is not a failure',
  );

  assert.equal(
    exitCodeOf(drivenRun({ status: 'partial', outcomes: [] }, BUILT_UNIT_OUTCOME)),
    3,
    'a unit was built and carried into Integrate, and no pull request came out of it',
  );
  assert.equal(exitCodeOf(drivenRun({ status: 'partial', outcomes: BUILT_UNIT_OUTCOME }, BUILT_UNIT_OUTCOME)), 3);
  assert.equal(exitCodeOf(drivenRun({ status: 'blocked', outcomes: BUILT_UNIT_OUTCOME }, BUILT_UNIT_OUTCOME)), 3);
  assert.equal(exitCodeOf(drivenRun({ status: 'ci-red-exhausted', outcomes: BUILT_UNIT_OUTCOME }, BUILT_UNIT_OUTCOME)), 3);
});

test('EXIT MAPPING: an unfinished build is still short-circuited before shipping is consulted', () => {
  const shipped = { status: 'all-shipped', outcomes: BUILT_UNIT_OUTCOME };
  assert.equal(exitCodeOf(drivenRun(shipped, BUILT_UNIT_OUTCOME, { quiescent: false })), 3);
  assert.equal(exitCodeOf(drivenRun(shipped, BUILT_UNIT_OUTCOME, { units: [{ id: 'alpha', state: 'parked' }] })), 3);
});

test('EXIT 1: a throw from the engine is reported on stderr rather than crashing the process', async (t) => {
  const io = stubIo(specDocument());
  const code = await runCli(tempArgv(t), io, () => ({}));
  assert.equal(code, 1);
  assert.match(io.errOut.join(''), /mitosis-cli:/);
  assert.match(io.errOut.join(''), /runUnit/);
});

test('EXIT 1: a thrown value with no message property is stringified rather than read as undefined', async (t) => {
  const io = stubIo(specDocument());
  io.readSpec = () => { throw { code: 'EACCES' }; };
  const code = await runCli(tempArgv(t), io, () => ({}));
  assert.equal(code, 1);
  assert.equal(io.errOut.join(''), 'mitosis-cli: [object Object]\n');
});

test('REAL PORTS: a successful dispatch verdict becomes Done carrying the child-reported sha and no check result the run never measured, and a failed one becomes a parked NeedsHuman', async () => {
  const okPorts = realPorts(
    { repoRoot: '/repo', requestsById: new Map([['alpha', { prompt: 'p' }]]) },
    { dispatch: async () => ({ ok: true, structured: { sha: 'abc123' } }) },
  );
  const okOutcome = await okPorts.runUnit({ id: 'alpha' }, { signal: null });
  assert.deepEqual(okOutcome, Done({ sha: 'abc123', envelope: null }));

  const failPorts = realPorts(
    { repoRoot: '/repo', requestsById: new Map([['alpha', { prompt: 'p' }]]) },
    { dispatch: async () => ({ ok: false, outcome: 'exit-nonzero', error: 'child exited 1' }) },
  );
  const failOutcome = await failPorts.runUnit({ id: 'alpha' }, { signal: null });
  assert.equal(failOutcome.tag, 'NeedsHuman');
  assert.equal(failOutcome.request.what, 'exit-nonzero');
});

test('REAL PORTS: a retry of a unit the spec declares no task for is refused by name rather than diagnosed against nothing', async () => {
  const noTaskMap = realPorts(
    { repoRoot: '/repo', requestsById: new Map([['alpha', { prompt: 'p' }]]) },
    { dispatch: async () => ({ ok: false, outcome: 'exit-nonzero', error: 'child exited 1' }) },
  );
  assert.equal((await noTaskMap.runUnit({ id: 'alpha' }, { signal: null })).tag, 'NeedsHuman');
  await assert.rejects(noTaskMap.runUnit({ id: 'alpha' }, { signal: null }), {
    name: 'TypeError',
    message: 'mitosis-cli: unit "alpha" failed an attempt the run may still retry, but the spec declares no task text for it, so the diagnosis that informs the retry would name no objective and the corrected re-attempt would be composed from nothing',
  });

  const nullTaskMap = realPorts(
    { repoRoot: '/repo', requestsById: new Map([['alpha', { prompt: 'p' }]]), taskById: null },
    { dispatch: async () => ({ ok: false, outcome: 'exit-nonzero', error: 'child exited 1' }) },
  );
  assert.equal((await nullTaskMap.runUnit({ id: 'alpha' }, { signal: null })).tag, 'NeedsHuman');
  await assert.rejects(nullTaskMap.runUnit({ id: 'alpha' }, { signal: null }), {
    name: 'TypeError',
    message: 'mitosis-cli: unit "alpha" failed an attempt the run may still retry, but the spec declares no task text for it, so the diagnosis that informs the retry would name no objective and the corrected re-attempt would be composed from nothing',
  });

  const blankTaskMap = realPorts(
    { repoRoot: '/repo', requestsById: new Map([['alpha', { prompt: 'p' }]]), taskById: new Map([['alpha', '   ']]) },
    { dispatch: async () => ({ ok: false, outcome: 'exit-nonzero', error: 'child exited 1' }) },
  );
  assert.equal((await blankTaskMap.runUnit({ id: 'alpha' }, { signal: null })).tag, 'NeedsHuman');
  await assert.rejects(blankTaskMap.runUnit({ id: 'alpha' }, { signal: null }), {
    name: 'TypeError',
    message: 'mitosis-cli: unit "alpha" failed an attempt the run may still retry, but the spec declares no task text for it, so the diagnosis that informs the retry would name no objective and the corrected re-attempt would be composed from nothing',
  });
});

test('REAL PORTS: a retry of a unit the spec declares a task for spends one diagnosis and re-attempts with the corrected prompt', async () => {
  const prompts = [];
  const ports = realPorts(
    {
      repoRoot: '/repo',
      requestsById: new Map([['alpha', { prompt: 'the implement prompt' }]]),
      taskById: new Map([['alpha', 'add the ship phase']]),
    },
    {
      dispatch: async (request) => {
        prompts.push(request.prompt);
        if (prompts.length === 1) return { ok: false, outcome: 'exit-nonzero', error: 'child exited 1' };
        if (prompts.length === 2) {
          return { ok: true, structured: { verdict: 'remediable', mechanism: 'worktree:reset-clean', correctedTask: 'reset first' } };
        }
        return { ok: true, structured: { sha: 'def456' } };
      },
    },
  );
  assert.equal((await ports.runUnit({ id: 'alpha' }, { signal: null })).tag, 'NeedsHuman');
  assert.deepEqual(await ports.runUnit({ id: 'alpha' }, { signal: null }), Done({ sha: 'def456', envelope: null }));
  assert.equal(prompts.length, 3);
  assert.equal(prompts[0], 'the implement prompt');
  assert.equal(prompts[1].includes('You are the in-run diagnostician for MSP "alpha"'), true);
  assert.equal(prompts[1].includes('Original objective for this stage: add the ship phase'), true);
  assert.equal(prompts[2].includes('correction attempt 1'), true);
  assert.equal(prompts[2].includes('Diagnosed mechanism fingerprint: worktree:reset-clean'), true);
  assert.equal(prompts[2].includes('reset first'), true);
});

test('REAL PORTS: a unit with no request in the spec is refused rather than reported settled', async () => {
  const ports = realPorts({ repoRoot: '/repo', requestsById: new Map() }, { dispatch: async () => ({ ok: true }) });
  await assert.rejects(
    ports.runUnit({ id: 'ghost' }, { signal: null }),
    (error) => error instanceof TypeError && /ghost/.test(error.message),
  );
});

test('REAL PORTS: a checkpoint ref is written with git update-ref and refused when there is no commit to point at', () => {
  const calls = [];
  const execAllowed = (binary, argv, cwd) => { calls.push([binary, argv, cwd]); return ''; };
  const ports = realPorts({ repoRoot: '/repo', requestsById: new Map() }, { execAllowed });
  ports.writeRef({ ref: 'refs/mitosis/0a1b2c3d/alpha', unitId: 'alpha', sha: 'abc123' });
  assert.deepEqual(calls[0], ['git', ['update-ref', 'refs/mitosis/0a1b2c3d/alpha', 'abc123'], '/repo']);
  assert.throws(
    () => ports.writeRef({ ref: 'refs/mitosis/0a1b2c3d/alpha', unitId: 'alpha', sha: null }),
    TypeError,
  );
});

test('REAL PORTS: the pull request probe runs the gh argv it is handed inside the repository root', () => {
  const calls = [];
  const run = (binary, argv, options) => { calls.push([binary, argv, options]); return {}; };
  const ports = realPorts({ repoRoot: '/repo', requestsById: new Map() }, { run });
  ports.gh(['pr', 'view']);
  const [binary, argv, options] = calls[0];
  assert.equal(binary, 'gh');
  assert.deepEqual(argv, ['pr', 'view']);
  assert.equal(options.cwd, '/repo');
  assert.ok(Number.isInteger(options.deadlineMs) && options.deadlineMs > 0);
});
