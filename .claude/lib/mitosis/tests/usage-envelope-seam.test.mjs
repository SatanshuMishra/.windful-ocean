import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGraph } from '../pool.mjs';
import { realPorts } from '../cli.mjs';
import { emitRunDocument } from '../decompose-emit.mjs';
import { openRun } from '../run-store.mjs';
import { emitsEnvelope } from './dispatch-fixtures.mjs';
import { openArgs, cleanupScratch } from './run-store-fixtures.mjs';

const OBSERVED_AT = '2026-08-16T09:30:00Z';

const SAMPLE_USAGE = Object.freeze({
  input_tokens: 1200,
  output_tokens: 340,
  cache_creation_input_tokens: 90000,
  cache_read_input_tokens: 410000,
});

function sampleEnvelope(overrides = {}) {
  return {
    usage: { ...SAMPLE_USAGE },
    total_cost_usd: 0.4213,
    modelUsage: null,
    session_id: 'sess-alpha',
    num_turns: 7,
    permission_denials: null,
    api_error_status: null,
    ...overrides,
  };
}

function verdict(overrides = {}) {
  return { ok: true, outcome: 'success', structured: { sha: 'a'.repeat(40) }, envelope: sampleEnvelope(), ...overrides };
}

function graphOf(ids, readyAfter = {}) {
  return { nodes: ids.map((id) => ({ id, request: { prompt: `do ${id}` } })), readyAfter };
}

function recordFor(result, id) {
  const record = result.records.find((entry) => entry.id === id);
  assert.ok(record, `the run carries no terminal record for ${id}`);
  return record;
}

test('the pool carries the dispatch envelope into the frozen terminal record', async () => {
  const result = await runGraph(graphOf(['alpha']), async () => verdict());
  const record = recordFor(result, 'alpha');
  assert.equal(record.state, 'ok');
  assert.deepEqual(record.envelope.usage, SAMPLE_USAGE);
  assert.equal(record.envelope.total_cost_usd, 0.4213);
  assert.equal(record.envelope.num_turns, 7);
  assert.ok(Object.isFrozen(record), 'the terminal record is not frozen');
  assert.ok(Object.isFrozen(record.envelope), 'the carried envelope is not frozen');
  assert.ok(Object.isFrozen(record.envelope.usage), 'the carried usage block is not frozen');
});

test('a failing dispatch still carries whatever envelope it produced', async () => {
  const failed = verdict({ ok: false, outcome: 'engine-error' });
  const result = await runGraph(graphOf(['alpha']), async () => failed);
  const record = recordFor(result, 'alpha');
  assert.equal(record.state, 'failed');
  assert.equal(record.envelope.usage.input_tokens, 1200);
});

test('a node that never dispatched carries a null envelope rather than an absent field', async () => {
  const result = await runGraph(graphOf(['alpha', 'beta'], { beta: ['alpha'] }), async (node) => {
    if (node.id === 'alpha') return verdict({ ok: false, outcome: 'engine-error', envelope: null });
    return verdict();
  });
  const blocked = recordFor(result, 'beta');
  assert.equal(blocked.state, 'blocked');
  assert.ok(Object.hasOwn(blocked, 'envelope'), 'a blocked record omits the envelope field entirely');
  assert.equal(blocked.envelope, null);
});

test('an envelope that is not a plain object is recorded as null rather than propagated', async () => {
  for (const bad of ['tokens', 42, [1, 2], undefined]) {
    const result = await runGraph(graphOf(['alpha']), async () => verdict({ envelope: bad }));
    assert.equal(recordFor(result, 'alpha').envelope, null, `the envelope ${JSON.stringify(bad)} was carried instead of refused`);
  }
});

test('non-finite token counts are normalized to null so no run reports a fabricated number', async () => {
  const dirty = sampleEnvelope({ usage: { input_tokens: 'many', output_tokens: Number.NaN, cache_creation_input_tokens: 5, cache_read_input_tokens: null }, total_cost_usd: Number.POSITIVE_INFINITY });
  const result = await runGraph(graphOf(['alpha']), async () => verdict({ envelope: dirty }));
  const record = recordFor(result, 'alpha');
  assert.deepEqual(record.envelope.usage, {
    input_tokens: null,
    output_tokens: null,
    cache_creation_input_tokens: 5,
    cache_read_input_tokens: null,
  });
  assert.equal(record.envelope.total_cost_usd, null);
});

test('the observer sees the envelope on the settle record it is handed', async () => {
  const seen = [];
  await runGraph(graphOf(['alpha']), async () => verdict(), { onRecord: (record) => seen.push(record) });
  const settled = seen.filter((record) => record.state !== 'running');
  assert.equal(settled.length, 1);
  assert.equal(settled[0].envelope.usage.output_tokens, 340);
  const running = seen.filter((record) => record.state === 'running');
  assert.equal(running[0].envelope, null);
});

test('a dispatch that throws is settled as failed and carries a null envelope rather than a stale one', async () => {
  const result = await runGraph(graphOf(['alpha', 'beta'], { beta: ['alpha'] }), async (node) => {
    if (node.id === 'alpha') throw new Error('the adapter exploded after billing tokens');
    return verdict();
  });
  const record = recordFor(result, 'alpha');
  assert.equal(record.state, 'failed', 'a thrown dispatch was recorded as a success');
  assert.equal(record.outcome, 'dispatch-threw');
  assert.match(record.reason, /the adapter exploded after billing tokens/);
  assert.ok(Object.hasOwn(record, 'envelope'), 'a thrown dispatch omits the envelope field entirely');
  assert.equal(record.envelope, null);
  const dependent = recordFor(result, 'beta');
  assert.equal(dependent.state, 'blocked', 'a dependent ran on the strength of a dispatch that threw');
  assert.equal(dependent.reason, 'dependency-failed');
});

test('a dispatch that returns a non-verdict is settled as a failed contract violation and its envelope is refused with it', async () => {
  for (const returned of [undefined, null, 'ok', ['ok'], { outcome: 'success', envelope: sampleEnvelope() }]) {
    const label = JSON.stringify(returned) ?? 'undefined';
    const result = await runGraph(graphOf(['alpha', 'beta'], { beta: ['alpha'] }), async (node) => {
      if (node.id === 'alpha') return returned;
      return verdict();
    });
    const record = recordFor(result, 'alpha');
    assert.equal(record.state, 'failed', `the pool believed ${label} as a verdict`);
    assert.equal(record.outcome, 'dispatch-contract-violation');
    assert.match(record.reason, /rather than a verdict carrying a boolean ok/);
    assert.equal(record.envelope, null, `the pool carried an envelope off ${label}, which it never established as a verdict`);
    const dependent = recordFor(result, 'beta');
    assert.equal(dependent.state, 'blocked', `a dependent ran on the strength of ${label}`);
    assert.equal(dependent.reason, 'dependency-failed');
  }
});

test('the cli unit port retains the envelope alongside the sha it already reads', async () => {
  const config = { repoRoot: '/repo', requestsById: new Map([['alpha', { prompt: 'do alpha' }]]) };
  const ports = realPorts(config, { dispatch: async () => verdict() });
  const outcome = await ports.runUnit({ id: 'alpha' }, { signal: null });
  assert.equal(outcome.tag, 'Done');
  assert.equal(outcome.value.sha, 'a'.repeat(40));
  assert.equal(outcome.value.green, true);
  assert.equal(outcome.value.envelope.usage.cache_read_input_tokens, 410000);
  assert.equal(outcome.value.envelope.total_cost_usd, 0.4213);
});

test('the cli unit port reports a null envelope when the child produced none', async () => {
  const config = { repoRoot: '/repo', requestsById: new Map([['alpha', { prompt: 'do alpha' }]]) };
  const ports = realPorts(config, { dispatch: async () => verdict({ envelope: undefined }) });
  const outcome = await ports.runUnit({ id: 'alpha' }, { signal: null });
  assert.ok(Object.hasOwn(outcome.value, 'envelope'), 'the Done value omits the envelope field entirely');
  assert.equal(outcome.value.envelope, null);
});

const MSPS = Object.freeze([
  {
    id: 'alpha-core',
    title: 'add the alpha core module',
    rationale: 'The alpha core module is the seam every later unit imports, so it lands first.',
    changeType: 'feat',
    scope: 'alpha',
    dependsOn: [],
    fileScope: { edit: ['src/alpha.mjs'], read: ['src/shared.mjs'], truncated: null },
  },
]);

function decomposePlace(t) {
  const root = mkdtempSync(join(tmpdir(), 'mitosis-usage-seam-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const spec = join(root, 'SPEC.md');
  writeFileSync(spec, '# an approved spec\n');
  return { root, spec, out: join(root, 'run-document.json') };
}

function decomposeArgs(place) {
  return {
    spec: place.spec,
    repoRoot: place.root,
    baseBranch: 'main',
    sourcePrefix: 'mitosis',
    branchPrefix: 'mitosis',
    worktreeRoot: join(place.root, 'worktrees'),
    scopedCheckCmd: ['node', '--test'],
    isolation: 'worktree',
    logicalRunId: 'run-alpha',
    out: place.out,
  };
}

test('decompose-emit retains the decomposer envelope alongside the document it writes', async (t) => {
  const place = decomposePlace(t);
  const deps = {
    spawn: emitsEnvelope({
      structured_output: { msps: JSON.parse(JSON.stringify(MSPS)) },
      usage: { ...SAMPLE_USAGE },
      total_cost_usd: 0.4213,
      num_turns: 7,
    }),
    loadImplementerPreamble: () => 'You own one unit end to end and return the commit sha you produced.',
  };
  const result = await emitRunDocument(decomposeArgs(place), deps);
  assert.equal(result.ok, true, result.error);
  assert.ok(existsSync(place.out), 'the run document was not written');
  assert.equal(result.envelope.usage.input_tokens, 1200);
  assert.equal(result.envelope.usage.cache_creation_input_tokens, 90000);
  assert.equal(result.envelope.total_cost_usd, 0.4213);
});

function usageLines(handle) {
  const path = join(handle.dir, 'usage.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
}

test('run-store writes one per-attempt usage line carrying the envelope', (t) => {
  t.after(cleanupScratch);
  const handle = openRun(openArgs());
  const path = handle.recordUsage('a3-run-store', { observedAt: OBSERVED_AT, envelope: sampleEnvelope() });
  handle.recordUsage('a3-tests', { observedAt: OBSERVED_AT, envelope: sampleEnvelope({ total_cost_usd: 1.5 }) });
  handle.release();
  assert.equal(path, join(handle.dir, 'usage.jsonl'));
  const lines = usageLines(handle);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], {
    unitId: 'a3-run-store',
    attempt: handle.attempt,
    observedAt: OBSERVED_AT,
    envelope: sampleEnvelope(),
  });
  assert.equal(lines[1].unitId, 'a3-tests');
  assert.equal(lines[1].envelope.total_cost_usd, 1.5);
});

test('run-store refuses a usage timestamp it would otherwise have to read from a clock', (t) => {
  t.after(cleanupScratch);
  const handle = openRun(openArgs());
  for (const bad of [undefined, null, '', 'yesterday', 1756000000000, new Date(0)]) {
    assert.throws(
      () => handle.recordUsage('a3-run-store', { observedAt: bad, envelope: sampleEnvelope() }),
      /run-store: observedAt/,
      `the observedAt ${JSON.stringify(bad)} was accepted`,
    );
  }
  handle.release();
  assert.deepEqual(usageLines(handle), []);
});

test('run-store refuses a usage envelope that is not a plain object', (t) => {
  t.after(cleanupScratch);
  const handle = openRun(openArgs());
  for (const bad of [undefined, null, 'tokens', [1], 4]) {
    assert.throws(
      () => handle.recordUsage('a3-run-store', { observedAt: OBSERVED_AT, envelope: bad }),
      /run-store: envelope/,
      `the envelope ${JSON.stringify(bad)} was accepted`,
    );
  }
  handle.release();
  assert.deepEqual(usageLines(handle), []);
});

test('run-store refuses a usage line for a unit this run was never opened for', (t) => {
  t.after(cleanupScratch);
  const handle = openRun(openArgs());
  assert.throws(
    () => handle.recordUsage('../escape', { observedAt: OBSERVED_AT, envelope: sampleEnvelope() }),
    /recordUsage names the unit/,
  );
  handle.release();
  assert.deepEqual(usageLines(handle), []);
});

test('run-store refuses a usage line written after the run lock is released', (t) => {
  t.after(cleanupScratch);
  const handle = openRun(openArgs());
  handle.release();
  assert.throws(
    () => handle.recordUsage('a3-run-store', { observedAt: OBSERVED_AT, envelope: sampleEnvelope() }),
    /recordUsage was called after release/,
  );
});

test('run-store refuses a usage request that is not a plain object', (t) => {
  t.after(cleanupScratch);
  const handle = openRun(openArgs());
  for (const bad of [undefined, null, 'usage', [1]]) {
    assert.throws(() => handle.recordUsage('a3-run-store', bad), /run-store: usage/, `the request ${JSON.stringify(bad)} was accepted`);
  }
  handle.release();
});
