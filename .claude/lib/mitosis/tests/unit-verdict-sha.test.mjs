import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realPorts, runCli } from '../cli.mjs';
import { emitRunDocument } from '../decompose-emit.mjs';
import { dispatch } from '../dispatch.mjs';
import { envelopeText, fakeChild } from './dispatch-fixtures.mjs';

const PREAMBLE = 'You own one unit end to end and return the commit sha you produced.';
const UNIT_SHA = '0123456789abcdef0123456789abcdef01234567';
const RUN_ID = '0a1b2c3d';
const AT = '2026-08-16T12:00:00Z';
const JOURNAL_PATH = '.mitosis/run.jsonl';
const REPO_SLUG = 'acme/widgets';
const INTEGRATION_BRANCH = 'integration';

const MSPS = Object.freeze([
  Object.freeze({
    id: 'alpha-core',
    title: 'add the alpha core module',
    rationale: 'The alpha core module is the seam every later unit imports, so it lands first.',
    changeType: 'feat',
    scope: 'alpha',
    dependsOn: [],
    fileScope: Object.freeze({ edit: ['src/alpha.mjs'], read: ['src/shared.mjs'], truncated: null }),
  }),
]);

function payloadForSchema(schemaText, unitReportsSha) {
  const schema = JSON.parse(schemaText);
  const properties = schema.properties === null || typeof schema.properties !== 'object' ? {} : schema.properties;
  if (Object.hasOwn(properties, 'msps')) return { msps: MSPS };
  if (Object.hasOwn(properties, 'sha')) return unitReportsSha ? { sha: UNIT_SHA } : {};
  throw new Error(`the fake child was handed a schema it cannot answer: ${schemaText}`);
}

function envelopeFor(argv, unitReportsSha) {
  const at = argv.indexOf('--json-schema');
  if (at === -1) return envelopeText({});
  return envelopeText({ structured_output: payloadForSchema(argv[at + 1], unitReportsSha) });
}

function fakeSpawn(calls, unitReportsSha) {
  return (binary, argv) => {
    calls.push({ binary, argv: [...argv] });
    const text = envelopeFor(argv, unitReportsSha);
    const child = fakeChild(undefined);
    setImmediate(() => {
      child.stdout.end(text);
      child.stderr.end();
      child.emit('exit', 0, null);
    });
    return child;
  };
}

function scratch(t) {
  const root = mkdtempSync(join(tmpdir(), 'mitosis-unit-verdict-sha-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const spec = join(root, 'SPEC.md');
  writeFileSync(spec, '# an approved spec\n');
  return { root, spec, out: join(root, 'run-document.json') };
}

function emitArgs(place, isolation) {
  return {
    spec: place.spec,
    repoRoot: place.root,
    baseBranch: 'main',
    sourcePrefix: 'mitosis',
    branchPrefix: 'mitosis',
    worktreeRoot: join(place.root, 'worktrees'),
    scopedCheckCmd: ['node', '--test'],
    isolation,
    logicalRunId: 'run-alpha',
    out: place.out,
  };
}

function cliArgv(place) {
  return [
    '--spec', place.out,
    '--run-id', RUN_ID,
    '--at', AT,
    '--repo-root', place.root,
    '--journal', JOURNAL_PATH,
    '--repo-slug', REPO_SLUG,
    '--integration-branch', INTEGRATION_BRANCH,
  ];
}

function stubIo(document) {
  const out = [];
  const errOut = [];
  return {
    out,
    errOut,
    log: (text) => { out.push(text); },
    err: (text) => { errOut.push(text); },
    readSpec: () => document,
  };
}

function stubHandle() {
  return {
    runKey: 'a-run-key',
    attempt: 1,
    recordStart: () => {},
    recordOutput: () => {},
    commitState: () => {},
    recordUsage: () => {},
    release: () => {},
  };
}

function sideEffects() {
  const exec = [];
  const journal = [];
  const genesis = [];
  const gh = [];
  return {
    exec,
    journal,
    genesis,
    gh,
    deps: {
      execAllowed: (binary, argv, cwd) => { exec.push({ binary, argv: [...argv], cwd }); return ''; },
      writeGenesis: async (request) => { genesis.push(request); },
      appendJournalLine: async (request) => { journal.push(request); },
      run: async (binary, argv, options) => { gh.push({ binary, argv: [...argv], options }); return { state: 'OPEN' }; },
    },
  };
}

async function emitThenRun(t, options = {}) {
  const isolation = options.isolation === undefined ? 'worktree' : options.isolation;
  const unitReportsSha = options.unitReportsSha === undefined ? true : options.unitReportsSha;
  const place = scratch(t);
  const calls = [];
  const spawn = fakeSpawn(calls, unitReportsSha);
  const emitted = await emitRunDocument(emitArgs(place, isolation), { spawn, loadImplementerPreamble: () => PREAMBLE });
  assert.equal(emitted.ok, true, emitted.error);
  const document = JSON.parse(readFileSync(place.out, 'utf8'));
  const io = stubIo(document);
  const effects = sideEffects();
  const makePorts = (config) => realPorts(config, {
    ...effects.deps,
    dispatch: (request) => dispatch(request, { spawn }),
  });
  const exitCode = await runCli(cliArgv(place), io, makePorts, { openRun: () => stubHandle() });
  return { calls, document, effects, io, exitCode };
}

function summaryOf(io) {
  assert.equal(io.out.length, 1, `the run printed no single summary; stderr carried ${JSON.stringify(io.errOut.join(''))}`);
  return JSON.parse(io.out[0]);
}

function stateOf(io, unitId) {
  const unit = summaryOf(io).units.find((entry) => entry.id === unitId);
  return unit === undefined ? null : unit.state;
}

function updateRefCalls(effects) {
  return effects.exec.filter((call) => call.binary === 'git' && call.argv[0] === 'update-ref');
}

test('a unit dispatched from an emitted run document settles done carrying the sha its child reported', async (t) => {
  const { effects, io, exitCode } = await emitThenRun(t);
  const summary = summaryOf(io);
  assert.deepEqual(
    summary.units,
    [{ id: 'alpha-core', state: 'done' }],
    `the unit did not reach done; stderr carried ${JSON.stringify(io.errOut.join(''))}`,
  );
  assert.equal(exitCode, 0, `stderr carried ${JSON.stringify(io.errOut.join(''))}`);

  const updateRef = effects.exec.find((call) => call.binary === 'git' && call.argv[0] === 'update-ref');
  assert.notEqual(updateRef, undefined, 'no checkpoint ref was written, so no sha ever reached the ref writer');
  const sha = updateRef.argv[2];
  assert.equal(typeof sha, 'string');
  assert.notEqual(sha, '');
  assert.equal(sha, UNIT_SHA);
});

test('a scope-fence unit settles done and asks for no checkpoint ref, because it is told to leave every change uncommitted', async (t) => {
  const { effects, io, exitCode } = await emitThenRun(t, { isolation: 'scope-fence' });
  assert.equal(
    stateOf(io, 'alpha-core'),
    'done',
    `the scope-fence unit did not reach done; stderr carried ${JSON.stringify(io.errOut.join(''))}`,
  );
  assert.equal(exitCode, 0, `stderr carried ${JSON.stringify(io.errOut.join(''))}`);
  assert.deepEqual(updateRefCalls(effects), [], 'a scope-fence unit owns no commit, so no ref may be written for it');
});

test('a worktree unit whose child reports no sha is still refused rather than checkpointed to nothing', async (t) => {
  const { effects, io, exitCode } = await emitThenRun(t, { unitReportsSha: false });
  assert.equal(stateOf(io, 'alpha-core'), 'parked');
  assert.equal(exitCode, 3);
  assert.deepEqual(updateRefCalls(effects), [], 'the guard refuses before git is reached, so no ref is written to nothing');
  assert.match(io.errOut.join(''), /post-dispatch-record-failed/);
});

test('the unit child is asked for its verdict against a schema, which is what makes its sha available', async (t) => {
  const { calls } = await emitThenRun(t);
  assert.equal(calls.length, 2, 'the run did not spawn exactly one decompose child and one unit child');
  const unitArgv = calls[1].argv;
  const at = unitArgv.indexOf('--json-schema');
  assert.notEqual(at, -1, 'the unit child was dispatched with no --json-schema, so its envelope carries no structured_output at all');
  const schema = JSON.parse(unitArgv[at + 1]);
  assert.deepEqual(schema.required, ['sha']);
  assert.match(unitArgv[unitArgv.length - 1], /report the full 40-character sha of your final commit/);
});
