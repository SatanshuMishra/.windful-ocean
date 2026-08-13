import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

function runCli(args, env, options = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [POOL_CLI, ...args], { env, ...options }, (error, stdout, stderr) => {
      resolve({
        code: error === null ? 0 : error.code,
        killed: error !== null && error.killed === true,
        stdout,
        stderr,
      });
    });
  });
}

function fixture(name, contents) {
  const path = join(scratch(), name);
  writeFileSync(path, JSON.stringify(contents));
  return path;
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

function deferred() {
  let resolve = null;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

function gatedDispatcher(verdicts) {
  const started = [];
  const finished = [];
  const gates = new Map();
  const live = { now: 0, peak: 0 };
  const dispatchFn = async (node) => {
    started.push(node.id);
    live.now += 1;
    live.peak = Math.max(live.peak, live.now);
    const gate = gates.get(node.id);
    if (gate !== undefined) await gate.promise;
    live.now -= 1;
    finished.push(node.id);
    return verdicts(node.id);
  };
  return { dispatchFn, started, finished, gates, live };
}

const ALWAYS_OK = () => ({ ok: true, outcome: 'success' });

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

test('a cyclic graph terminates in a bounded child process rather than spinning the event loop', async () => {
  const graphPath = fixture('cycle.json', {
    nodes: [{ id: 'x' }, { id: 'y' }, { id: 'z' }],
    readyAfter: { x: ['y'], y: ['z'], z: ['x'] },
  });
  const run = await runCli([graphPath], process.env, { timeout: 15000 });
  assert.equal(run.killed, false, 'the pool had to be killed, so it spun instead of terminating: an in-process settle guard cannot observe this because a synchronous scheduling spin starves the event loop the guard timer needs');
  assert.equal(run.code, 3, `expected the completed-with-failures exit, got ${run.code}: ${run.stderr}`);
  const printed = JSON.parse(run.stdout);
  assert.deepEqual(printed.records.map((record) => record.reason), ['unsatisfiable', 'unsatisfiable', 'unsatisfiable']);
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

test('a diamond DAG completes with every node ok and no node starting before both of its dependencies', async () => {
  const runner = gatedDispatcher(ALWAYS_OK);
  const result = await runGraph(
    {
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      readyAfter: { b: ['a'], c: ['a'], d: ['b', 'c'] },
    },
    runner.dispatchFn,
    {},
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.records.map((record) => record.state), ['ok', 'ok', 'ok', 'ok']);
  assert.equal(runner.started[0], 'a', 'the root must run first');
  assert.equal(runner.started[3], 'd', 'the join must run last');
  assert.deepEqual([...runner.started].slice(1, 3).sort(), ['b', 'c']);
  const joinStart = runner.started.indexOf('d');
  assert.ok(runner.finished.indexOf('b') < joinStart, 'd must not start before b finished');
  assert.ok(runner.finished.indexOf('c') < joinStart, 'd must not start before c finished');
});

test('ready siblings are admitted in node-id order when the cap forces a choice', async () => {
  const runner = gatedDispatcher(ALWAYS_OK);
  const result = await runGraph(
    { nodes: [{ id: 'c' }, { id: 'b' }, { id: 'a' }], readyAfter: {} },
    runner.dispatchFn,
    { concurrency: 1 },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(runner.started, ['a', 'b', 'c'], 'a tie between ready nodes breaks on node id, never on declaration order');
  assert.deepEqual(result.records.map((record) => record.id), ['a', 'b', 'c']);
});

test('the record census is identical across two runs whose completion order is reversed', async () => {
  const graph = {
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    readyAfter: { c: ['a'], d: ['b'] },
  };
  async function runWithReleaseOrder(order) {
    const runner = gatedDispatcher(ALWAYS_OK);
    for (const id of ['a', 'b']) runner.gates.set(id, deferred());
    const pending = runGraph(graph, runner.dispatchFn, {});
    for (const id of order) runner.gates.get(id).resolve();
    return { result: await pending, finished: runner.finished };
  }
  const first = await runWithReleaseOrder(['a', 'b']);
  const second = await runWithReleaseOrder(['b', 'a']);
  assert.notDeepEqual(first.finished, second.finished, 'the two runs must genuinely differ in completion order, or this assertion proves nothing');
  assert.deepEqual(second.result.records, first.result.records);
  assert.deepEqual(second.result.records.map((record) => record.id), ['a', 'b', 'c', 'd']);
  assert.equal(second.result.ok, first.result.ok);
});

test('a cycle downstream of a healthy branch is settled blocked with unsatisfiable and its unmet dependency ids', async () => {
  const runner = gatedDispatcher(ALWAYS_OK);
  const result = await settledWithin(
    runGraph(
      {
        nodes: [{ id: 'healthy' }, { id: 'loop-a' }, { id: 'loop-b' }, { id: 'tail' }],
        readyAfter: { 'loop-a': ['loop-b'], 'loop-b': ['loop-a'], tail: ['loop-a'] },
      },
      runner.dispatchFn,
      {},
    ),
    5000,
    'a graph whose only remaining nodes are unsatisfiable must terminate',
  );
  const records = byId(result.records);
  assert.deepEqual(runner.started, ['healthy'], 'only the satisfiable branch may be dispatched');
  assert.equal(records.get('healthy').state, 'ok');
  for (const id of ['loop-a', 'loop-b', 'tail']) {
    assert.equal(records.get(id).state, 'blocked', `${id} must be blocked, never dropped`);
    assert.equal(records.get(id).reason, 'unsatisfiable');
  }
  assert.deepEqual(records.get('loop-a').blockedBy, ['loop-b']);
  assert.deepEqual(records.get('tail').blockedBy, ['loop-a']);
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics.waves, [['healthy']]);
  assert.deepEqual(result.diagnostics.unlayered, ['loop-a', 'loop-b', 'tail']);
});

test('observed concurrency never exceeds the cap', async () => {
  const runner = gatedDispatcher(ALWAYS_OK);
  const nodes = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((id) => ({ id }));
  for (const node of nodes) runner.gates.set(node.id, deferred());
  const pending = runGraph({ nodes, readyAfter: {} }, runner.dispatchFn, { concurrency: 3 });
  for (const node of nodes) runner.gates.get(node.id).resolve();
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(runner.live.peak, 3, 'the pool must admit exactly the cap and never one more');
  assert.equal(result.diagnostics.peakConcurrency, 3, 'the pool must report the same peak it enforced');
  assert.equal(result.records.length, 10);
});
