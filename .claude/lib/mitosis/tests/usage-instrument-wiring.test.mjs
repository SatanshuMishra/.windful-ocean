import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Built, Done } from '../boundary.mjs';
import { realPorts, runCli } from '../cli.mjs';
import { computeRunKey } from '../run-store.mjs';
import { pack } from './file-scope-fixtures.mjs';

const AT = '2026-08-16T09:30:00Z';

const ALPHA_USAGE = Object.freeze({
  input_tokens: 1200,
  output_tokens: 340,
  cache_creation_input_tokens: 90000,
  cache_read_input_tokens: 410000,
});

const BETA_USAGE = Object.freeze({
  input_tokens: 77,
  output_tokens: 8,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 12,
});

function envelopeOf(usage, cost) {
  return {
    usage: { ...usage },
    total_cost_usd: cost,
    num_turns: 3,
    session_id: 'sess-alpha',
    modelUsage: null,
    permission_denials: null,
    api_error_status: null,
  };
}

function specDocument() {
  return {
    manifest: { logicalRunId: 'r1', clusters: [], msps: [{ id: 'm1' }] },
    specs: [
      { id: 'alpha', fileScope: pack(['alpha.mjs']), request: { prompt: 'do alpha' } },
      { id: 'beta', fileScope: pack(['beta.mjs']), request: { prompt: 'do beta' } },
    ],
  };
}

function tempRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'mitosis-usage-wiring-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
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

function argvFor(root) {
  return [
    '--spec', '/spec.json',
    '--run-id', '0a1b2c3d',
    '--at', AT,
    '--repo-root', root,
    '--journal', '.mitosis/run.jsonl',
    '--repo-slug', 'acme/widgets',
    '--integration-branch', 'integration',
  ];
}

function inertDeps(dispatch) {
  return {
    dispatch,
    writeGenesis: async () => {},
    appendJournalLine: async () => {},
    execAllowed: () => '',
    run: () => ({ state: 'OPEN' }),
  };
}

function dispatchByPrompt(verdicts) {
  return async (request) => {
    const next = verdicts.get(request.prompt);
    if (next === undefined) throw new Error(`the test stub carries no verdict for ${JSON.stringify(request.prompt)}`);
    return next();
  };
}

function stubPorts(runUnit) {
  return {
    runUnit,
    writeGenesis: async () => {},
    appendJournal: async () => {},
    writeRef: async () => {},
    gh: async () => ({ state: 'OPEN' }),
  };
}

function usagePath(root, spec) {
  return join(root, '.mitosis', 'runs', computeRunKey(spec), 'attempt-1', 'usage.jsonl');
}

function readUsage(path) {
  assert.ok(existsSync(path), `the run left no usage record at ${path}`);
  return readFileSync(path, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
}

function linesFor(lines, unitId) {
  return lines.filter((line) => line.unitId === unitId);
}

function readUsageIfAny(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
}

function soloSpecDocument() {
  return {
    manifest: { logicalRunId: 'r1', clusters: [], msps: [{ id: 'm1' }] },
    specs: [{ id: 'alpha', fileScope: pack(['alpha.mjs']), request: { prompt: 'do alpha' } }],
  };
}

test('a completed engine run leaves one usage line per dispatch at the run store attempt path', async (t) => {
  const root = tempRoot(t);
  const spec = specDocument();
  const io = stubIo(spec);
  const dispatch = dispatchByPrompt(new Map([
    ['do alpha', () => ({ ok: true, outcome: 'success', structured: { sha: 'a'.repeat(40) }, envelope: envelopeOf(ALPHA_USAGE, 0.4213) })],
    ['do beta', () => ({ ok: true, outcome: 'success', structured: { sha: 'b'.repeat(40) }, envelope: envelopeOf(BETA_USAGE, 0.0091) })],
  ]));

  const code = await runCli(argvFor(root), io, (config) => realPorts(config, inertDeps(dispatch)));
  assert.equal(code, 0, io.errOut.join(''));

  const lines = readUsage(usagePath(root, spec));
  assert.equal(lines.length, 2, 'the run recorded one usage line per dispatch');

  const [alpha] = linesFor(lines, 'alpha');
  assert.ok(alpha, 'the run recorded no usage line for alpha');
  assert.deepEqual(alpha.envelope.usage, { ...ALPHA_USAGE });
  assert.equal(alpha.envelope.total_cost_usd, 0.4213);
  assert.equal(alpha.observedAt, AT);
  assert.equal(alpha.attempt, 1);

  const [beta] = linesFor(lines, 'beta');
  assert.ok(beta, 'the run recorded no usage line for beta');
  assert.deepEqual(beta.envelope.usage, { ...BETA_USAGE });
  assert.equal(beta.envelope.total_cost_usd, 0.0091);
});

test('a redispatched unit contributes one usage line per dispatch attempt, so the dispatch count is recoverable from disk alone', async (t) => {
  const root = tempRoot(t);
  const spec = specDocument();
  const io = stubIo(spec);
  const seenByUnit = new Map();
  const runUnit = async (unit) => {
    const seen = (seenByUnit.get(unit.id) ?? 0) + 1;
    seenByUnit.set(unit.id, seen);
    const value = { sha: `${unit.id}-${seen}`, green: true, envelope: envelopeOf(ALPHA_USAGE, seen / 10) };
    return unit.id === 'alpha' && seen === 1 ? Built(value) : Done(value);
  };

  const code = await runCli(argvFor(root), io, () => stubPorts(runUnit));
  assert.equal(code, 0, io.errOut.join(''));

  const lines = readUsage(usagePath(root, spec));
  const dispatchCount = lines.length;
  const unitCount = new Set(lines.map((line) => line.unitId)).size;
  assert.equal(unitCount, 2, 'the run recorded usage for a number of units the spec never declared');
  assert.equal(dispatchCount, 3, 'the durable record counts dispatches, not units');
  assert.ok(dispatchCount > unitCount, 'the redispatch is invisible in the durable record');
  assert.deepEqual(
    linesFor(lines, 'alpha').map((line) => line.envelope.total_cost_usd),
    [0.1, 0.2],
    'the two alpha lines are not two distinct dispatches',
  );
});

test('a failed dispatch is counted with the envelope the child already billed', async (t) => {
  const root = tempRoot(t);
  const spec = specDocument();
  const io = stubIo(spec);
  const dispatch = dispatchByPrompt(new Map([
    ['do alpha', () => ({ ok: false, outcome: 'engine-error', error: 'the child reported is_error', envelope: envelopeOf(ALPHA_USAGE, 0.4213) })],
    ['do beta', () => ({ ok: true, outcome: 'success', structured: { sha: 'b'.repeat(40) }, envelope: envelopeOf(BETA_USAGE, 0.0091) })],
  ]));

  const code = await runCli(argvFor(root), io, (config) => realPorts(config, inertDeps(dispatch)));
  assert.equal(code, 3, io.errOut.join(''));

  const lines = readUsage(usagePath(root, spec));
  assert.equal(lines.length, 3, 'a failed dispatch went uncounted');
  assert.equal(linesFor(lines, 'alpha').length, 2, 'the redispatch of the failed unit was billed but not counted');

  const [alpha] = linesFor(lines, 'alpha');
  assert.ok(alpha, 'the failed dispatch left no usage line');
  assert.deepEqual(alpha.envelope.usage, { ...ALPHA_USAGE });
  assert.equal(alpha.envelope.total_cost_usd, 0.4213);
});

test('a checkpoint write that fails after the child was billed still records what the child cost', async (t) => {
  const root = tempRoot(t);
  const spec = specDocument();
  const io = stubIo(spec);
  const dispatch = dispatchByPrompt(new Map([
    ['do alpha', () => ({ ok: true, outcome: 'success', envelope: envelopeOf(ALPHA_USAGE, 0.4213) })],
    ['do beta', () => ({ ok: true, outcome: 'success', structured: { sha: 'b'.repeat(40) }, envelope: envelopeOf(BETA_USAGE, 0.0091) })],
  ]));

  const code = await runCli(argvFor(root), io, (config) => realPorts(config, inertDeps(dispatch)));
  assert.equal(code, 3, 'a unit whose checkpoint never landed was reported complete');

  const lines = readUsage(usagePath(root, spec));
  const [alpha] = linesFor(lines, 'alpha');
  assert.ok(alpha, 'the dispatch whose checkpoint write threw left no usage line');
  assert.deepEqual(
    alpha.envelope.usage,
    { ...ALPHA_USAGE },
    'the tokens the child actually spent were recorded as unbilled because a port threw after the dispatch returned',
  );
  assert.equal(alpha.envelope.total_cost_usd, 0.4213, 'money that was spent reads as null in the durable record');

  const stderr = io.errOut.join('');
  assert.doesNotMatch(stderr, /was never dispatched/, 'a unit that was dispatched and billed was reported as never dispatched');
  assert.match(stderr, /the checkpoint ref/, 'the port failure that stopped the checkpoint was swallowed');
});

test('a run observer that throws cannot starve the durable usage writer', async (t) => {
  const root = tempRoot(t);
  const spec = soloSpecDocument();
  const io = { ...stubIo(spec), err: () => { throw new Error('EPIPE: the stderr stream is gone'); } };
  const dispatch = dispatchByPrompt(new Map([
    ['do alpha', () => { throw new Error('the adapter exploded'); }],
  ]));

  await assert.rejects(runCli(argvFor(root), io, (config) => realPorts(config, inertDeps(dispatch))));

  const lines = readUsageIfAny(usagePath(root, spec));
  assert.equal(
    linesFor(lines, 'alpha').length,
    1,
    'a best-effort log observer that threw prevented the durable usage line from ever being written',
  );
});

test('the run summary names the run key and attempt the evidence was written under', async (t) => {
  const root = tempRoot(t);
  const spec = specDocument();
  const io = stubIo(spec);
  const dispatch = dispatchByPrompt(new Map([
    ['do alpha', () => ({ ok: true, outcome: 'success', structured: { sha: 'a'.repeat(40) }, envelope: envelopeOf(ALPHA_USAGE, 0.4213) })],
    ['do beta', () => ({ ok: true, outcome: 'success', structured: { sha: 'b'.repeat(40) }, envelope: envelopeOf(BETA_USAGE, 0.0091) })],
  ]));

  const code = await runCli(argvFor(root), io, (config) => realPorts(config, inertDeps(dispatch)));
  assert.equal(code, 0, io.errOut.join(''));

  const summary = JSON.parse(io.out.join(''));
  assert.equal(summary.runKey, computeRunKey(spec), 'the summary does not say which run key holds this run evidence');
  assert.equal(summary.attempt, 1, 'the summary does not say which attempt holds this run evidence');
});

test('a billed and an unbilled usage line carry the same envelope key set', async (t) => {
  const root = tempRoot(t);
  const spec = specDocument();
  const io = stubIo(spec);
  const dispatch = dispatchByPrompt(new Map([
    ['do alpha', () => { throw new Error('the adapter exploded before it billed anything'); }],
    ['do beta', () => ({ ok: true, outcome: 'success', structured: { sha: 'b'.repeat(40) }, envelope: envelopeOf(BETA_USAGE, 0.0091) })],
  ]));

  const code = await runCli(argvFor(root), io, (config) => realPorts(config, inertDeps(dispatch)));
  assert.equal(code, 3, io.errOut.join(''));

  const lines = readUsage(usagePath(root, spec));
  const [unbilled] = linesFor(lines, 'alpha');
  const [billed] = linesFor(lines, 'beta');
  assert.ok(unbilled, 'the dispatch that threw left no usage line');
  assert.ok(billed, 'the dispatch that succeeded left no usage line');
  assert.deepEqual(
    Object.keys(unbilled.envelope).sort(),
    Object.keys(billed.envelope).sort(),
    'a consumer reading usage.jsonl as one closed shape meets two different envelope schemas',
  );
  assert.deepEqual(Object.keys(unbilled.envelope.usage).sort(), Object.keys(billed.envelope.usage).sort());
  assert.equal(unbilled.envelope.total_cost_usd, null);
  assert.equal(unbilled.envelope.session_id, null);
});
