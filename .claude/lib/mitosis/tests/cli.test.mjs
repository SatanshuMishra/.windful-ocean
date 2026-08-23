import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pack } from './file-scope-fixtures.mjs';
import { CLI_USAGE, driverPorts, exitCodeOf, parseCliArgv, realPorts, realWait, runCli } from '../cli.mjs';
import { runPhases } from '../phase-driver.mjs';
import { openRun as realOpenRun } from '../run-store.mjs';
import { PLAN_ARTIFACT_SCHEMA, PLAN_REVIEW_VERDICT_SCHEMA, planArtifactPathFor } from '../unit-planning.mjs';
import { runVerdictOf } from '../run-verdict.mjs';
import { Done, NeedsHuman } from '../boundary.mjs';
import { refusingDispatch } from './dispatch-fixtures.mjs';

function fullArgv(extra = [], root = '/repo') {
  return [
    '--spec', '/spec.json',
    '--run-id', '0a1b2c3d',
    '--at', '2026-08-15T12:00:00Z',
    '--repo-root', root,
    '--journal', join(root, '.mitosis', 'run.jsonl'),
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
  assert.equal(value.journalPath, '/repo/.mitosis/run.jsonl');
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
  const code = await runCli(['--bogus'], io, makePorts, { dispatch: refusingDispatch().dispatch });
  assert.equal(code, 2);
  assert.ok(io.errOut.join('').includes(CLI_USAGE));
  assert.deepEqual(io.out, []);
});

function withFlag(argv, flag, value) {
  const index = argv.indexOf(flag);
  return [...argv.slice(0, index + 1), value, ...argv.slice(index + 2)];
}

function refusedPorts() {
  const reached = [];
  const refuse = (port) => () => {
    reached.push(port);
    throw new Error(`${port} must not be reached`);
  };
  return {
    reached,
    makePorts: refuse('makePorts'),
    deps: { openRun: refuse('openRun'), dispatch: refuse('dispatch'), foldJournal: refuse('foldJournal') },
  };
}

test('PARSE REFUSES A RELATIVE JOURNAL: no run-store lock, no attempt directory and no paid dispatch are created', async () => {
  const io = stubIo(specDocument());
  const guard = refusedPorts();
  const code = await runCli(withFlag(fullArgv(), '--journal', '.mitosis/run.jsonl'), io, guard.makePorts, guard.deps);
  assert.deepEqual(
    guard.reached,
    [],
    'openRun takes the run-store lock and creates the attempt directory, so a relative --journal must be refused at argv parse and never reach it',
  );
  assert.equal(code, 2, 'a journal this entry point cannot resolve is a usage failure, not a run that failed');
  assert.match(io.errOut.join(''), /--journal must be absolute/);
  assert.ok(io.errOut.join('').includes(CLI_USAGE));
  assert.deepEqual(io.out, []);
});

test('PARSE REFUSES A JOURNAL OUTSIDE THE REPOSITORY ROOT: the confinement check is not fooled by a relative root', async () => {
  const io = stubIo(specDocument());
  const guard = refusedPorts();
  const argv = withFlag(withFlag(fullArgv(), '--repo-root', 'repo'), '--journal', '/repo/.mitosis/run.jsonl');
  const code = await runCli(argv, io, guard.makePorts, guard.deps);
  assert.deepEqual(guard.reached, [], 'a relative --repo-root makes the confinement comparison meaningless, so it is refused before the run opens');
  assert.equal(code, 2);
  assert.match(io.errOut.join(''), /--repo-root must be absolute/);
});

test('PARSE REFUSES AN --at THAT IS NOT AN ISO INSTANT: no run-store lock, no attempt directory and no paid dispatch are created', async () => {
  for (const token of ['1755259200000', '2026-08-15T12:00Z', '2026-08-15T12:00:00', 'yesterday']) {
    const io = stubIo(specDocument());
    const guard = refusedPorts();
    const code = await runCli(withFlag(fullArgv(), '--at', token), io, guard.makePorts, guard.deps);
    assert.deepEqual(guard.reached, [], `openRun must never be reached for --at ${token}, because the lock and the attempt directory would outlive the refusal`);
    assert.equal(code, 2, `--at ${token} is a usage failure, not a run that failed`);
    assert.match(io.errOut.join(''), /--at needs an ISO instant/);
    assert.deepEqual(io.out, []);
  }
});

test('ONE RESOLVER: the read port and every write port receive the identical absolute journal location', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'mitosis-cli-resolver-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const journal = join(root, '.mitosis', 'run.jsonl');
  const io = stubIo(specDocument());
  const stub = stubPorts(async () => Done({ sha: 'sha-alpha' }));
  const readPaths = [];
  const code = await runCli(fullArgv([], root), io, () => stub.ports, {
    foldJournal: (path) => { readPaths.push(path); return null; },
    dispatch: () => { throw new Error('dispatch must not be reached'); },
  });
  assert.equal(code, 3);
  assert.deepEqual(readPaths, [journal], 'the read port is handed the one resolved location, never a path it resolves for itself');
  const journalWrites = stub.calls.filter((call) => call.value !== null && typeof call.value === 'object' && Object.hasOwn(call.value, 'path'));
  assert.deepEqual(
    [...new Set(journalWrites.map((call) => call.port))].sort(),
    ['appendJournal', 'writeGenesis'],
    'both journal write ports ran, so neither claim below is made over an empty set',
  );
  assert.deepEqual(
    [...new Set(journalWrites.map((call) => call.value.path))],
    [journal],
    'one resolver produces one journal location, and every write port receives that exact string',
  );
});

test('THE INSTANT ARRIVES AS ARGV: the --at value is the at the engine writes into the quiescent-exit record', async (t) => {
  const io = stubIo(specDocument());
  const stub = stubPorts(async () => Done({ sha: 'sha-alpha' }));
  const code = await runCli(tempArgv(t), io, () => stub.ports, { dispatch: refusingDispatch().dispatch });
  const appendCalls = stub.calls.filter((call) => call.port === 'appendJournal');
  const lastRecord = JSON.parse(appendCalls[appendCalls.length - 1].value.line);
  assert.equal(lastRecord.kind, 'quiescent-exit');
  assert.equal(lastRecord.at, '2026-08-15T12:00:00Z');
  assert.equal(code, 3, 'this spec declares no base branch, so alpha is built and parked at Integrate and no pull request is opened; a run that built and shipped nothing is not a clean run');
});

test('EXIT 3: a run that reaches quiescence with a unit short of done reports incomplete', async (t) => {
  const io = stubIo(specDocument());
  const stub = stubPorts(async () => NeedsHuman({ kind: 'ask' }, []));
  const code = await runCli(tempArgv(t), io, () => stub.ports, { dispatch: refusingDispatch().dispatch });
  assert.equal(code, 3);
  assert.match(io.out.join(''), /"state": "parked"/);
});

test('EXIT 3: a run that built every unit and opened no pull request is never reported clean', async (t) => {
  const io = stubIo(specDocument());
  const stub = stubPorts(async () => Done({ sha: 'sha-alpha' }));
  const code = await runCli(tempArgv(t), io, () => stub.ports, { dispatch: refusingDispatch().dispatch });
  const summary = JSON.parse(io.out.join(''));
  assert.deepEqual(summary.units, [{ id: 'alpha', state: 'done' }], 'every unit reached done, which is all the unit disposition alone can see');
  assert.deepEqual(summary.ship.opened, [], 'the run opened no pull request at all');
  assert.equal(code, 3, 'an operator reading 0 here would be told a run that shipped nothing had succeeded');
});

function drivenRun(ship, integrateOutcomes = [], execute = {}) {
  return {
    phases: {
      Probe: { handle: { runKey: 'r1', attempt: 1 } },
      Resume: { restarted: true },
      Execute: { result: { quiescent: true, units: [{ id: 'alpha', state: 'done' }], ...execute } },
      Integrate: { outcomes: integrateOutcomes },
      Ship: { ci: { unwatched: [] }, ...ship },
    },
  };
}

function codeOf(ship, integrateOutcomes = [], execute = {}) {
  return exitCodeOf(runVerdictOf(drivenRun(ship, integrateOutcomes, execute)));
}

const BUILT_UNIT_OUTCOME = Object.freeze([Object.freeze({ unitId: 'alpha', state: 'parked' })]);

test('EXIT MAPPING: shipping decides the code once the build is clean, and a hand-off awaiting a human merge is a success', () => {
  assert.equal(codeOf({ status: 'all-integrated-opened', outcomes: BUILT_UNIT_OUTCOME }, BUILT_UNIT_OUTCOME), 0);
  assert.equal(
    codeOf({ status: 'awaiting-approval', outcomes: BUILT_UNIT_OUTCOME }, BUILT_UNIT_OUTCOME),
    0,
    'the engine never merges by design, so a run that opened its pull requests and waits on a human is the healthy terminal state; a red code here would train the operator to ignore the code',
  );
  assert.equal(
    codeOf({ status: 'nothing-pending', outcomes: [] }, []),
    0,
    'nothing was pending to integrate and nothing was pending to ship, so a run that held no work is not a failure',
  );

  assert.equal(
    codeOf({ status: 'nothing-pending', outcomes: [] }, BUILT_UNIT_OUTCOME),
    3,
    'a unit was built and carried into Integrate, and no pull request came out of it',
  );
  assert.equal(codeOf({ status: 'partial', outcomes: BUILT_UNIT_OUTCOME }, BUILT_UNIT_OUTCOME), 3);
  assert.equal(codeOf({ status: 'blocked', outcomes: BUILT_UNIT_OUTCOME }, BUILT_UNIT_OUTCOME), 3);
  assert.equal(codeOf({ status: 'ci-red-exhausted', outcomes: BUILT_UNIT_OUTCOME }, BUILT_UNIT_OUTCOME), 3);
  assert.equal(
    codeOf({ status: 'all-integrated-opened', outcomes: BUILT_UNIT_OUTCOME, ci: { unwatched: BUILT_UNIT_OUTCOME } }, BUILT_UNIT_OUTCOME),
    0,
    'the pull requests are open and their checks went unread; the withheld status word reports that, and the code still reports the hand-off the run completed',
  );
});

test('EXIT MAPPING: an unfinished build is still short-circuited before shipping is consulted', () => {
  const shipped = { status: 'all-integrated-opened', outcomes: BUILT_UNIT_OUTCOME };
  assert.equal(codeOf(shipped, BUILT_UNIT_OUTCOME, { quiescent: false }), 3);
  assert.equal(codeOf(shipped, BUILT_UNIT_OUTCOME, { units: [{ id: 'alpha', state: 'parked' }] }), 3);
});

test('SUMMARY: the verdict is the first key an operator reads, and it names every top-level field the skill relays', async (t) => {
  const io = stubIo(specDocument());
  const stub = stubPorts(async () => Done({ sha: 'sha-alpha' }));
  const code = await runCli(tempArgv(t), io, () => stub.ports, { dispatch: refusingDispatch().dispatch });
  const summary = JSON.parse(io.out.join(''));
  assert.equal(Object.keys(summary)[0], 'verdict', 'the terminal state is what the operator reads first, not a field buried under the phase reports');
  assert.deepEqual(Object.keys(summary), ['verdict', 'runKey', 'attempt', 'quiescent', 'aborted', 'ticks', 'units', 'prep', 'resume', 'integrate', 'ship']);
  assert.equal(summary.verdict.status, 'nothing-pending');
  assert.equal(summary.verdict.ciUnwatchedCount, 0);
  assert.equal(code, 3);
});

test('EXIT 1: a throw from the engine is reported on stderr rather than crashing the process', async (t) => {
  const io = stubIo(specDocument());
  const code = await runCli(tempArgv(t), io, () => ({}), { dispatch: refusingDispatch().dispatch });
  assert.equal(code, 1);
  assert.match(io.errOut.join(''), /mitosis-cli:/);
  assert.match(io.errOut.join(''), /runUnit/);
});

test('EXIT 1: a thrown value with no message property is stringified rather than read as undefined', async (t) => {
  const io = stubIo(specDocument());
  io.readSpec = () => { throw { code: 'EACCES' }; };
  const code = await runCli(tempArgv(t), io, () => ({}), { dispatch: refusingDispatch().dispatch });
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
  const ports = realPorts({ repoRoot: '/repo', requestsById: new Map() }, { execAllowed, dispatch: refusingDispatch().dispatch });
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
  const ports = realPorts({ repoRoot: '/repo', requestsById: new Map() }, { run, dispatch: refusingDispatch().dispatch });
  ports.gh(['pr', 'view']);
  const [binary, argv, options] = calls[0];
  assert.equal(binary, 'gh');
  assert.deepEqual(argv, ['pr', 'view']);
  assert.equal(options.cwd, '/repo');
  assert.ok(Number.isInteger(options.deadlineMs) && options.deadlineMs > 0);
});

const MITOSIS_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const ORACLE_SITE = 'ship';
const ORACLE_STEP = 'done-oracle';
const BUILD_CALL = 'buildGhCommand(';
const STRING_LITERAL = /^(['"])([^'"]*)\1$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const MEMBER_EXPRESSION = /^([A-Za-z_$][\w$]*)\.[\w$]+$/;
const CONST_STRING = /^const\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']*)'\s*;/gm;
const IMPORT_CLAUSE = /^import\s+([^;]*?)\s+from\s+['"][^'"]+['"]\s*;/gm;
const PR_STATE_CALL = /\b[A-Za-z_$][\w$]*\.prState\s*\(/;

const ORACLE_CLASSIFIERS = Object.freeze([
  ['construction-site', (o, lines) => lines.has(o.line)],
  ['constant-declaration', (o) => /^\s*const\s+[A-Za-z_$][\w$]*\s*=\s*'done-oracle'\s*;\s*$/.test(o.text)],
  ['gh-command-table-definition', (o) => /^\s*'done-oracle'\s*:\s*\([^)]*\)\s*=>/.test(o.text)],
  ['site-fixture-row', (o) => /^\s*step:\s*'done-oracle',?\s*$/.test(o.text)],
  ['command-separation-schema', (o) => /^\s*'(?:gh|git)\s+[a-z0-9-]+\/done-oracle'\s*:/.test(o.text) || /\bsite:\s*'[a-z0-9-]+',\s*step:\s*'done-oracle'/.test(o.text)],
  ['error-message-text', (o) => /'[^']*\sdone-oracle\s[^']*'/.test(o.text)],
]);

function productionModules() {
  return readdirSync(MITOSIS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => entry.name)
    .sort();
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function argumentExpressions(text, openIndex) {
  const args = [];
  let depth = 0;
  let quote = null;
  let start = openIndex + 1;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' && depth === 0) return { args: [...args, text.slice(start, i)], end: i };
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) {
      args.push(text.slice(start, i));
      start = i + 1;
    }
  }
  return null;
}

function moduleBindings(text) {
  const constants = new Map();
  for (const match of text.matchAll(CONST_STRING)) constants.set(match[1], match[2]);
  const imported = new Set();
  for (const match of text.matchAll(IMPORT_CLAUSE)) {
    for (const token of match[1].replace(/[{}]/g, ' ').split(',')) {
      const parts = token.trim().split(/\s+as\s+/);
      const bound = parts[parts.length - 1].trim();
      if (IDENTIFIER.test(bound)) imported.add(bound);
    }
  }
  return { constants, imported };
}

function resolveSpecifier(expression, bindings) {
  const trimmed = expression.trim();
  const literal = STRING_LITERAL.exec(trimmed);
  if (literal !== null) return { kind: 'static', value: literal[2] };
  const member = MEMBER_EXPRESSION.exec(trimmed);
  const base = IDENTIFIER.test(trimmed) ? trimmed : (member === null ? null : member[1]);
  if (base === null) return { kind: 'unresolvable', value: trimmed };
  if (bindings.imported.has(base)) return { kind: 'unresolvable', value: trimmed };
  if (member !== null) return bindings.constants.has(base) ? { kind: 'unresolvable', value: trimmed } : { kind: 'forwarded', value: trimmed };
  return bindings.constants.has(base) ? { kind: 'static', value: bindings.constants.get(base) } : { kind: 'forwarded', value: trimmed };
}

function siteKindOf(site, step) {
  if (site.kind === 'unresolvable' || step.kind === 'unresolvable') return 'unresolvable';
  return site.kind === 'static' && step.kind === 'static' ? 'static' : 'forwarded';
}

function ghConstructionSites(name, text) {
  const bindings = moduleBindings(text);
  const sites = [];
  let index = text.indexOf(BUILD_CALL);
  while (index !== -1) {
    const parsed = /\bfunction\s+$/.test(text.slice(0, index)) ? undefined : argumentExpressions(text, index + BUILD_CALL.length - 1);
    if (parsed === null || (parsed !== undefined && parsed.args.length < 2)) {
      sites.push({ file: name, line: lineOf(text, index), endLine: lineOf(text, index), kind: 'unresolvable', site: null, step: null, text: text.slice(index, index + 100) });
    } else if (parsed !== undefined) {
      const site = resolveSpecifier(parsed.args[0], bindings);
      const step = resolveSpecifier(parsed.args[1], bindings);
      sites.push({ file: name, line: lineOf(text, index), endLine: lineOf(text, parsed.end), kind: siteKindOf(site, step), site: site.value, step: step.value, text: text.slice(index, parsed.end + 1) });
    }
    index = text.indexOf(BUILD_CALL, index + BUILD_CALL.length);
  }
  return sites;
}

function oracleOccurrences(name, text) {
  const found = [];
  text.split('\n').forEach((line, index) => {
    let at = line.indexOf(ORACLE_STEP);
    while (at !== -1) {
      found.push({ file: name, line: index + 1, text: line });
      at = line.indexOf(ORACLE_STEP, at + ORACLE_STEP.length);
    }
  });
  return found;
}

function oracleConstructionLines(sites) {
  const lines = new Set();
  for (const site of sites) {
    if (site.kind !== 'static' || site.site !== ORACLE_SITE || site.step !== ORACLE_STEP) continue;
    for (let line = site.line; line <= site.endLine; line += 1) lines.add(line);
  }
  return lines;
}

function oracleCensus() {
  const modules = productionModules();
  const sources = new Map(modules.map((name) => [name, readFileSync(join(MITOSIS_DIR, name), 'utf8')]));
  const sites = modules.flatMap((name) => ghConstructionSites(name, sources.get(name)));
  const linesByFile = new Map(modules.map((name) => [name, oracleConstructionLines(sites.filter((s) => s.file === name))]));
  const occurrences = modules.flatMap((name) => oracleOccurrences(name, sources.get(name)));
  const classified = occurrences.map((occurrence) => ({
    ...occurrence,
    labels: ORACLE_CLASSIFIERS.filter(([, matches]) => matches(occurrence, linesByFile.get(occurrence.file))).map(([label]) => label),
  }));
  return { modules, sources, sites, classified };
}

function located(entries) {
  return entries.map((entry) => `${entry.file}:${entry.line}: ${entry.text.trim()}`);
}

test('CLOSED CENSUS: exactly one production construction site builds the ship/done-oracle gh command, and every done-oracle token in the tree classifies', () => {
  const census = oracleCensus();
  assert.ok(census.modules.length > 0, 'the census domain is empty, which would make every claim below vacuous');
  assert.ok(census.sites.length > 0, 'the census found no buildGhCommand call at all, which would make the construction-site claim vacuous');
  assert.ok(census.classified.length > 0, 'the census found no done-oracle token at all, which would make the classification claim vacuous');

  assert.deepEqual(
    located(census.sites.filter((site) => site.kind === 'unresolvable')),
    [],
    'a buildGhCommand call whose site or step cannot be resolved from this module alone leaves the construction-site claim open',
  );

  const constructionSites = census.sites.filter((site) => site.kind === 'static' && site.site === ORACLE_SITE && site.step === ORACLE_STEP);
  assert.deepEqual(
    constructionSites.map((site) => site.file),
    ['cli.mjs'],
    'exactly one production site constructs the ship/done-oracle command, and it is cli.mjs prStatePort',
  );

  assert.deepEqual(
    located(census.classified.filter((entry) => entry.labels.length !== 1)),
    [],
    'every done-oracle token must carry exactly one classification; an unclassified or ambiguous one halts the census',
  );

  assert.deepEqual(
    located(census.classified.filter((entry) => entry.labels[0] === 'construction-site')),
    [],
    'no done-oracle token sits on a construction line: the one surviving site names both specifier halves through constants',
  );

  assert.deepEqual(
    census.modules.filter((name) => PR_STATE_CALL.test(census.sources.get(name))),
    ['ship-publish.mjs'],
    'ship-publish.mjs is the sole production consumer of the done-oracle port; cli.mjs constructs the command and supplies the port',
  );
});

test('realWait refuses zero milliseconds, the exact lower boundary of the positive-integer guard', () => {
  assert.throws(() => realWait(0), TypeError);
});

test('realWait refuses a negative count of milliseconds', () => {
  assert.throws(() => realWait(-1), TypeError);
});

test('realWait refuses a non-integer count of milliseconds even when it is positive', () => {
  assert.throws(() => realWait(1.5), TypeError);
});

test('realWait accepts the smallest positive integer, one millisecond above the refused boundary, and its promise settles', async () => {
  await assert.doesNotReject(realWait(1));
});

test('realWait genuinely delays resolution by the requested count of real milliseconds, rather than resolving synchronously', async () => {
  const startedAt = Date.now();
  await realWait(20);
  const elapsedMs = Date.now() - startedAt;
  assert.ok(elapsedMs >= 15, `realWait(20) resolved after only ${elapsedMs}ms, so the requested pause was not actually honoured`);
});

function noopDriverIo() {
  return Object.freeze({ log: () => {}, err: () => {}, readSpec: () => ({}) });
}

test('driverPorts selects an injected wait over the real one, proven by the injected call being recorded with the exact millisecond count it was asked for', async () => {
  const calls = [];
  const injected = async (ms) => { calls.push(ms); };
  const ports = driverPorts(noopDriverIo(), () => ({}), { wait: injected }, '/repo');
  await ports.wait(5);
  assert.deepEqual(calls, [5]);
});

test('driverPorts selects the real wait when none is injected, proven by the exact refusal only realWait produces', async () => {
  const ports = driverPorts(noopDriverIo(), () => ({}), {}, '/repo');
  assert.throws(() => ports.wait(0), /wait needs a positive integer count of milliseconds/);
  await assert.doesNotReject(ports.wait(1));
});

const UNWRITABLE_GENESIS_REQUEST = Object.freeze({ repoRoot: '', path: '', manifest: { logicalRunId: 'r1' } });

test('driverPorts selects an injected writeGenesis over the real one, proven by the injected call receiving the exact request the port was handed and answering for it', () => {
  const calls = [];
  const injected = (request) => { calls.push(request); return 'the injected genesis answer'; };
  const ports = driverPorts(noopDriverIo(), () => ({}), { writeGenesis: injected }, '/repo');

  assert.equal(ports.writeGenesis(UNWRITABLE_GENESIS_REQUEST), 'the injected genesis answer');
  assert.deepEqual(calls, [UNWRITABLE_GENESIS_REQUEST]);
  assert.equal(calls[0], UNWRITABLE_GENESIS_REQUEST, 'the injected writeGenesis is handed the request by reference, not a copy of it');
});

test('driverPorts selects the real writeGenesis when none is injected, proven by the exact refusal only journal-store writeGenesis produces', () => {
  const ports = driverPorts(noopDriverIo(), () => ({}), {}, '/repo');

  assert.throws(
    () => ports.writeGenesis(null),
    {
      name: 'TypeError',
      message: 'journal-store: writeGenesis takes one plain object carrying repoRoot, path and manifest, received null',
    },
  );
  assert.throws(
    () => ports.writeGenesis(UNWRITABLE_GENESIS_REQUEST),
    {
      name: 'TypeError',
      message: 'journal-store: repoRoot must be a non-empty string naming the repository root the journal is written inside, received string',
    },
  );
});

function planningPrepFixture(specPath) {
  return {
    title: 'unit alpha',
    rationale: 'do alpha',
    dependsList: '(none)',
    specPath,
    fileScope: pack(['alpha.mjs']),
  };
}

function planningDrivenRequest(repoRoot, runId) {
  return {
    specPath: '/spec.json',
    spec: {
      manifest: { clusters: [], msps: [{ id: 'alpha' }] },
      specs: [{
        id: 'alpha',
        fileScope: pack(['alpha.mjs']),
        request: { prompt: 'do alpha' },
        prep: planningPrepFixture('/spec.json'),
      }],
    },
    runId,
    at: '2026-08-22T00:00:00Z',
    repoRoot,
    journalPath: '.mitosis/run.jsonl',
    repoSlug: 'acme/widgets',
    integrationBranch: 'integration',
    window: undefined,
  };
}

function stubbedRunResult(binary, argv) {
  return { outcome: 'completed', binary, argv, command: binary, args: argv, status: 1, stdout: '', stderr: 'stub: no-op', signal: null, error: null };
}

function planningDispatchScript(expectedPlanPath) {
  let reviewCalls = 0;
  return async (request) => {
    if (request.schema === PLAN_ARTIFACT_SCHEMA) {
      return { ok: true, outcome: 'success', structured: { planPath: expectedPlanPath } };
    }
    if (request.schema === PLAN_REVIEW_VERDICT_SCHEMA) {
      reviewCalls += 1;
      if (reviewCalls === 1) {
        return {
          ok: true,
          outcome: 'success',
          structured: { verdict: 'needs-changes', findings: [{ axis: 'necessity', severity: 'high', detail: 'trim scope' }] },
        };
      }
      return { ok: true, outcome: 'success', structured: { verdict: 'approve' } };
    }
    return { ok: true, outcome: 'success', structured: null, result: 'stub dispatch' };
  };
}

test('PLANNING DISPATCH RECORDING: a run that drafts, reviews, revises and re-reviews a plan records plan, plan-review and replan dispatches for that unit', async (t) => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'mitosis-cli-plan-record-'));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const runId = 'runrec01';
  const expectedPlanPath = planArtifactPathFor(repoRoot, runId, 'alpha');
  let handle = null;
  const deps = {
    dispatch: planningDispatchScript(expectedPlanPath),
    skillPointers: () => ({ libDir: '/lib/mitosis', writingPlansGlob: '/plugins/*/skills/writing-plans/SKILL.md' }),
    observePlan: () => ({ exists: true, isFile: true, size: 10, detail: 'stub observation' }),
    writeGenesis: async () => {},
    appendJournalLine: async () => {},
    foldJournal: () => null,
    boundaryGate: () => ({ pass: true, output: 'no new finding', blocking: [], baseCensus: null }),
    teardownHeadWorktree: () => null,
    wait: async () => {},
    run: stubbedRunResult,
    openRun: (request) => { handle = realOpenRun(request); return handle; },
  };
  const makePorts = () => ({
    runUnit: async (unit) => Done({ sha: `sha-${unit.id}`, green: true }),
    writeGenesis: async () => {},
    appendJournal: async () => {},
    writeRef: async () => {},
    gh: async () => ({ state: 'OPEN' }),
  });
  const ports = driverPorts(noopDriverIo(), makePorts, deps, repoRoot);
  try {
    await runPhases(planningDrivenRequest(repoRoot, runId), ports);
  } catch {}
  assert.ok(handle !== null, 'the run never opened a run store, so no dispatches.jsonl could have been written at all');
  const dispatchesPath = join(handle.dir, 'dispatches.jsonl');
  const lines = existsSync(dispatchesPath)
    ? readFileSync(dispatchesPath, 'utf8').trim().split('\n').filter((line) => line.length > 0).map((line) => JSON.parse(line))
    : [];
  const alphaKinds = lines.filter((line) => line.unitId === 'alpha').map((line) => line.kind);
  assert.deepEqual(
    alphaKinds,
    ['plan', 'plan-review', 'replan', 'plan-review'],
    `expected the planning loop for unit "alpha" to record plan, plan-review, replan, plan-review in order, recorded ${JSON.stringify(alphaKinds)}`,
  );
});
