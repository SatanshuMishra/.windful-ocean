import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGraph } from '../pool.mjs';

const POOL_CLI = fileURLToPath(new URL('../pool.mjs', import.meta.url));
const NOOP_DISPATCH = async () => ({ ok: true, outcome: 'success' });
const PENDING = Symbol('pending');
const scratchDirs = [];

after(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'mitosis-pool-'));
  scratchDirs.push(dir);
  return dir;
}

function runCli(args, env) {
  return new Promise((resolve) => {
    execFile(process.execPath, [POOL_CLI, ...args], { env }, (error, stdout, stderr) => {
      resolve({ code: error === null ? 0 : error.code, stdout, stderr });
    });
  });
}

async function settledWithin(promise, ms, label) {
  let timer = null;
  const guard = new Promise((resolve) => { timer = setTimeout(() => resolve(PENDING), ms); });
  const outcome = await Promise.race([promise.then((value) => value, (error) => error), guard]);
  clearTimeout(timer);
  assert.notEqual(outcome, PENDING, label);
  return outcome;
}

function byId(records) {
  return new Map(records.map((record) => [record.id, record]));
}

test('a graph with no readyAfter is refused rather than run as if it had no edges', async () => {
  await assert.rejects(
    () => runGraph({ nodes: [{ id: 'a' }, { id: 'b' }] }, NOOP_DISPATCH, {}),
    /graph\.readyAfter must be a non-null, non-array object/,
  );
  await assert.rejects(
    () => runGraph({ nodes: [{ id: 'a' }], readyAfter: [] }, NOOP_DISPATCH, {}),
    /graph\.readyAfter must be a non-null, non-array object/,
  );
});

test('a node id that is missing, malformed or duplicated is refused with a named reason', async () => {
  await assert.rejects(
    () => runGraph({ nodes: [{}], readyAfter: {} }, NOOP_DISPATCH, {}),
    /every graph node needs an id matching/,
  );
  await assert.rejects(
    () => runGraph({ nodes: [{ id: 'Node_One' }], readyAfter: {} }, NOOP_DISPATCH, {}),
    /every graph node needs an id matching/,
  );
  await assert.rejects(
    () => runGraph({ nodes: [{ id: 'a' }, { id: 'a' }], readyAfter: {} }, NOOP_DISPATCH, {}),
    /two graph nodes share the id "a"/,
  );
  await assert.rejects(
    () => runGraph({ nodes: [{ id: 'a' }], readyAfter: { a: ['ghost'] } }, NOOP_DISPATCH, {}),
    /is ready after "ghost", which is not the id of any graph node/,
  );
  await assert.rejects(
    () => runGraph({ nodes: [{ id: 'a' }], readyAfter: { ghost: [] } }, NOOP_DISPATCH, {}),
    /graph\.readyAfter names "ghost"/,
  );
});

test('a concurrency override may only narrow the pool and is refused when it widens or is not a positive integer', async () => {
  const graph = { nodes: [{ id: 'a' }], readyAfter: {} };
  const narrowed = await runGraph(graph, NOOP_DISPATCH, { concurrency: 1 });
  assert.equal(narrowed.diagnostics.concurrency, 1);
  const defaulted = await runGraph(graph, NOOP_DISPATCH, {});
  assert.equal(defaulted.diagnostics.concurrency, 8, 'the default cap must be the engine BUILD_AHEAD_CAP');
  for (const bad of [9, 0, -1, 2.5, '4']) {
    await assert.rejects(
      () => runGraph(graph, NOOP_DISPATCH, { concurrency: bad }),
      /may only NARROW the pool, never widen it past the engine cap/,
      `concurrency ${JSON.stringify(bad)} must be refused`,
    );
  }
});

test('a graph that is entirely one cycle terminates within a bounded window without dispatching any node', async () => {
  const dispatched = [];
  const dispatchFn = async (node) => {
    dispatched.push(node.id);
    return { ok: true, outcome: 'success' };
  };
  const result = await settledWithin(
    runGraph(
      { nodes: [{ id: 'x' }, { id: 'y' }, { id: 'z' }], readyAfter: { x: ['y'], y: ['z'], z: ['x'] } },
      dispatchFn,
      {},
    ),
    5000,
    'a graph with no dispatchable node must terminate rather than spin: the pool has no non-throw exit for stalled progress',
  );
  assert.deepEqual(dispatched, [], 'no node in a cycle can ever be dispatchable');
  assert.equal(result.ok, false);
  assert.deepEqual(result.records.map((record) => record.id), ['x', 'y', 'z']);
  for (const record of result.records) {
    assert.equal(record.state, 'blocked');
    assert.equal(record.reason, 'unsatisfiable');
    assert.equal(record.blockedBy.length, 1, `${record.id} must name the dependency it is waiting on`);
  }
  assert.deepEqual(byId(result.records).get('x').blockedBy, ['y']);
  assert.deepEqual(result.diagnostics.unlayered, ['x', 'y', 'z']);
  assert.deepEqual(result.diagnostics.waves, []);
});

test('the CLI prints its usage line and exits 2 when the graph path is missing', async () => {
  const result = await runCli([], process.env);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /usage: pool\.mjs <graph\.json> \[--concurrency N\]/);
  assert.equal(result.stdout, '');
});

test('the CLI prints a pool error line and exits 1 when the graph file cannot be read', async () => {
  const result = await runCli([join(scratch(), 'absent.json')], process.env);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /^pool error: /m);
  assert.equal(result.stdout, '');
});
