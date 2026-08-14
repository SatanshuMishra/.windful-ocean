import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGraph } from '../pool.mjs';
import { dispatch } from '../dispatch.mjs';

const POOL_CLI = fileURLToPath(new URL('../pool.mjs', import.meta.url));
const STACK_PROBE = fileURLToPath(new URL('./pool-stack-probe.mjs', import.meta.url));
const STACK_PROBE_KB = 150;
const STACK_PROBE_FLAG = `--stack-size=${STACK_PROBE_KB}`;
const STACK_PROBE_BUDGET_MS = 30000;
const STACK_PROBE_ENV = Object.freeze({});
const NOOP_DISPATCH = async () => ({ ok: true, outcome: 'success' });
const PENDING = Symbol('pending');
const ESCAPE = String.fromCharCode(27);
const BELL = String.fromCharCode(7);
const CONTROL_BYTE = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}-${String.fromCharCode(159)}]`);
const scratchDirs = [];
const strayPids = [];

after(() => {
  for (const pid of strayPids) {
    if (alive(pid)) process.kill(pid, 'SIGKILL');
  }
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'mitosis-pool-'));
  scratchDirs.push(dir);
  return dir;
}

function startNode(args, options = {}) {
  let child = null;
  const done = new Promise((resolve) => {
    child = execFile(process.execPath, args, options, (error, stdout, stderr) => {
      resolve({
        code: error === null ? 0 : error.code,
        signal: error === null ? null : error.signal ?? null,
        killed: error !== null && error.killed === true,
        stdout,
        stderr,
      });
    });
  });
  return { child, done };
}

function runNode(args, options = {}) {
  return startNode(args, options).done;
}

function runCli(args, env, options = {}) {
  return runNode([POOL_CLI, ...args], { env, ...options });
}

function probeReport(stdout) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    assert.fail(`the depth probe must print exactly one JSON line for the assertions below to read, and this run printed ${JSON.stringify(stdout)} instead, so a probe that died before it measured anything would otherwise pass as a silent success: ${error.message}`);
  }
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

const CRITICAL_PATH_IDS = Object.freeze(['alpha-hub', 'w1', 'w2', 'w3', 'w4', 'w5', 'zeta-head', 'zeta-1', 'zeta-2', 'zeta-3']);
const CRITICAL_PATH_CENSUS = Object.freeze([...CRITICAL_PATH_IDS].sort());
const CRITICAL_PATH_EDGES = Object.freeze({
  w1: Object.freeze(['alpha-hub']),
  w2: Object.freeze(['alpha-hub']),
  w3: Object.freeze(['alpha-hub']),
  w4: Object.freeze(['alpha-hub']),
  w5: Object.freeze(['alpha-hub']),
  'zeta-1': Object.freeze(['zeta-head']),
  'zeta-2': Object.freeze(['zeta-1']),
  'zeta-3': Object.freeze(['zeta-2']),
});

function criticalPathGraph(ids) {
  return { nodes: ids.map((id) => ({ id })), readyAfter: CRITICAL_PATH_EDGES };
}

function stubEnv(body) {
  const dir = scratch();
  const stub = join(dir, 'claude');
  writeFileSync(stub, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  chmodSync(stub, 0o755);
  return { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}` };
}

function pidRecordingStub(pidDir) {
  const dir = JSON.stringify(pidDir);
  return stubEnv([
    "const { writeFileSync } = require('node:fs');",
    "const { join } = require('node:path');",
    'const id = process.argv[process.argv.length - 1];',
    'const timer = setInterval(() => {}, 3600000);',
    "process.on('SIGTERM', () => {",
    `  writeFileSync(join(${dir}, \`\${id}.sigterm\`), 'received');`,
    '  clearInterval(timer);',
    '  process.exit(0);',
    '});',
    `writeFileSync(join(${dir}, id), String(process.pid));`,
  ].join('\n'));
}

function spawnRecordingStub(markerDir) {
  return stubEnv([
    "const { writeFileSync } = require('node:fs');",
    `writeFileSync(require('node:path').join(${JSON.stringify(markerDir)}, 'spawned'), process.cwd());`,
    "process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'done', usage: {}, total_cost_usd: 0 }));",
  ].join('\n'));
}

function startCli(args, env) {
  let child = null;
  const done = new Promise((resolve) => {
    child = execFile(process.execPath, [POOL_CLI, ...args], { env }, (error, stdout, stderr) => {
      resolve({ code: error === null ? 0 : error.code, stdout, stderr });
    });
  });
  return { child, done };
}

async function waitUntil(predicate, ms, label) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  assert.fail(`${label} within ${ms}ms`);
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
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

test('a long pole is dispatched before a wider branch carrying more dependents', async () => {
  const runner = gatedDispatcher(ALWAYS_OK);
  const result = await runGraph(criticalPathGraph(CRITICAL_PATH_IDS), runner.dispatchFn, { concurrency: 1 });
  assert.equal(result.ok, true);
  assert.equal(
    runner.started[0],
    'zeta-head',
    'the pool dispatched the fan-out hub first because it counts five dependents against the chain head\'s three, but those five become ready together and queue on the one semaphore, while the chain is the long pole every later node waits behind: ordering on raw item count spends the whole run on the branch that was never the constraint',
  );
  assert.deepEqual(
    result.records.map((record) => record.id),
    CRITICAL_PATH_CENSUS,
    'the returned census must stay in node-id order whatever the dispatch policy decides, or a resume keyed on record position re-dispatches a different node on an unchanged graph',
  );
  assert.notDeepEqual(
    runner.started,
    CRITICAL_PATH_CENSUS,
    'dispatch order never diverged from the census order on this graph, so the ordering assertion above could pass on a policy that reordered nothing',
  );
});

test('the dispatch order of one graph is the same whichever order its nodes were declared in', async () => {
  async function runDeclaredAs(ids) {
    const runner = gatedDispatcher(ALWAYS_OK);
    const result = await runGraph(criticalPathGraph(ids), runner.dispatchFn, { concurrency: 1 });
    return { started: runner.started, records: result.records };
  }
  const declared = await runDeclaredAs(CRITICAL_PATH_IDS);
  const reversed = await runDeclaredAs([...CRITICAL_PATH_IDS].reverse());
  assert.equal(declared.started.length, CRITICAL_PATH_IDS.length, 'every node must have been dispatched, or the comparison below holds two empty runs against each other');
  assert.deepEqual(
    reversed.started,
    declared.started,
    'the same graph dispatched in two different orders because its nodes arrived in a different order: an ordering pass that walks the declaration array rather than the sorted ids makes a rerun of an unchanged plan dispatch a different node first',
  );
  assert.deepEqual(reversed.records, declared.records, 'the record census must be identical across the two declarations, or a resume keyed on it cannot be trusted');
});

test('the ordering pass reads only the edges and writes nothing onto the nodes it hands the dispatcher', async () => {
  const graph = {
    nodes: CRITICAL_PATH_IDS.map((id) => ({ id, request: { model: `model-for-${id}` } })),
    readyAfter: CRITICAL_PATH_EDGES,
  };
  const before = structuredClone(graph);
  const seen = [];
  const dispatchFn = async (node) => {
    seen.push(Object.freeze({ id: node.id, model: node.request.model, keys: Object.freeze(Object.keys(node).sort()) }));
    return { ok: true, outcome: 'success' };
  };
  const result = await runGraph(graph, dispatchFn, { concurrency: 1 });
  assert.equal(result.ok, true);
  assert.deepEqual(
    graph,
    before,
    'the ordering pass wrote back into the graph the caller still holds, so a second run over the same object would order on values the first run planted rather than on the edges the caller declared',
  );
  assert.deepEqual(seen.map((entry) => entry.id).sort(), [...CRITICAL_PATH_CENSUS], 'every node must reach the dispatcher exactly once');
  for (const entry of seen) {
    assert.equal(entry.model, `model-for-${entry.id}`, `node ${entry.id} reached the dispatcher carrying a model the ordering pass had rewritten, and the model is what the policy layer downstream picks a tier from`);
    assert.deepEqual(
      entry.keys,
      ['id', 'request'],
      `node ${entry.id} reached the dispatcher carrying a field the graph never declared: memoizing a height onto the node plants a count under a name the tiering layer already consumes, so an ordering detail silently becomes a model decision`,
    );
  }
});

test('a chain at the depth a recursive longest-path walk fails on is ordered and dispatched in full', async () => {
  const startedAt = Date.now();
  const started = startNode([STACK_PROBE_FLAG, STACK_PROBE], { env: STACK_PROBE_ENV, timeout: STACK_PROBE_BUDGET_MS });
  strayPids.push(started.child.pid);
  const probe = await started.done;
  assert.equal(
    probe.killed,
    false,
    `the depth probe was killed at its ${STACK_PROBE_BUDGET_MS}ms budget after ${Date.now() - startedAt}ms: the probe measures a recursion limit in work linear in that depth and then dispatches a chain it caps, so what it runs is bounded whatever ${STACK_PROBE_FLAG} binds to, and a kill here means this runner could not finish that bounded work rather than that the probe chose a depth too large to dispatch`,
  );
  assert.equal(
    probe.code,
    0,
    `the depth probe exited ${probe.code} on signal ${probe.signal} instead of reporting a measurement, so nothing below was checked against anything: a signal here is a crash the probe never chose, and Node reports killed false for it because it was not the killer: ${probe.stderr}`,
  );
  const measured = probeReport(probe.stdout);
  assert.equal(
    Number.isInteger(measured.recursionLimit) && measured.recursionLimit > 0,
    true,
    `the depth probe reported ${JSON.stringify(measured.recursionLimit)} rather than a depth it measured under a constrained stack, and a guard that cannot name the depth it ran at pins nothing on any machine`,
  );
  assert.equal(
    measured.recursiveThrew,
    true,
    `a memoized recursive walk with a cycle guard completed the same ${measured.recursionLimit}-node chain instead of exhausting the stack, so this run compared the pool against a reference that never failed and would stay green on the recursive ordering pass it exists to reject`,
  );
  assert.equal(
    measured.recursionLimit <= measured.dispatchCap,
    true,
    `${STACK_PROBE_FLAG} did not bind in the probe child: the recursive walk survived to ${measured.recursionLimit} frames, past the ${measured.dispatchCap} this guard caps its dispatched chain at, so no chain was dispatched at all. --stack-size is a V8 hint honoured differently across platforms and Node builds, and the pool's drive loop is quadratic in node count, so a guard that dispatched whatever depth the default stack reaches would spend minutes here and then be read as an ordering pass that hangs`,
  );
  assert.equal(
    measured.dispatchedDepth,
    measured.recursionLimit,
    `the probe dispatched a ${measured.dispatchedDepth}-node chain while the reference recursion only failed at ${measured.recursionLimit}, so the pool was never handed the depth that reference could not walk and the two assertions below are about a shallower graph than the one this guard is named for`,
  );
  const failure = measured.poolFailure === null || measured.poolFailure === undefined
    ? 'the run left a node that never settled ok'
    : measured.poolFailure;
  assert.equal(
    measured.poolOk,
    true,
    `the pool did not complete the ${measured.dispatchedDepth}-node chain the reference recursion could not walk: ${failure}. The depth was measured in that same constrained process rather than written down here, so this is the stack limit of the machine running the suite, not a constant that drifted away from one`,
  );
  assert.equal(
    measured.orderMatched,
    true,
    `the ${measured.dispatchedDepth}-node chain reached the dispatcher out of dependency order: a chain admits exactly one node at a time, in dependency order, however deep it runs`,
  );
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

test('a source feeding only into a cycle is still dispatched while the cycle settles unsatisfiable', async () => {
  const runner = gatedDispatcher(ALWAYS_OK);
  const result = await settledWithin(
    runGraph(
      {
        nodes: [{ id: 'source' }, { id: 'loop-a' }, { id: 'loop-b' }],
        readyAfter: { 'loop-a': ['loop-b', 'source'], 'loop-b': ['loop-a'] },
      },
      runner.dispatchFn,
      {},
    ),
    5000,
    'no node here sits below a cycle, so a longest-path walk resolves nothing and an ordering pass that waits on a length it can never compute hangs on a graph whose source was dispatchable from the first iteration',
  );
  const records = byId(result.records);
  assert.deepEqual(
    runner.started,
    ['source'],
    'a node with an empty dependency list is dispatchable whatever its dependents do, and dropping it because it sits above a cycle silently discards work the caller asked for',
  );
  assert.equal(records.get('source').state, 'ok');
  for (const id of ['loop-a', 'loop-b']) {
    assert.equal(records.get(id).state, 'blocked', `${id} must be blocked, never dropped`);
    assert.equal(records.get(id).reason, 'unsatisfiable');
  }
  assert.deepEqual(records.get('loop-a').blockedBy, ['loop-b'], 'the satisfied dependency must not be named as the reason the node is stuck');
  assert.deepEqual(records.get('loop-b').blockedBy, ['loop-a']);
  assert.equal(result.ok, false);
});

test('an id whose longest path never resolves is ordered on the sentinel, not on the part of the walk that did resolve', async () => {
  const graph = {
    nodes: [
      { id: 'chain-head' },
      { id: 'chain-mid' },
      { id: 'chain-tail' },
      { id: 'doomed-tail' },
      { id: 'loop-a' },
      { id: 'loop-b' },
      { id: 'solo' },
    ],
    readyAfter: {
      'chain-mid': ['chain-head'],
      'chain-tail': ['chain-mid'],
      'loop-a': ['loop-b', 'chain-head'],
      'loop-b': ['loop-a'],
      'doomed-tail': ['loop-a'],
    },
  };
  const runner = gatedDispatcher(ALWAYS_OK);
  const result = await settledWithin(
    runGraph(graph, runner.dispatchFn, { concurrency: 1 }),
    5000,
    'a graph carrying a cycle must still terminate, or the order it dispatched in cannot be read at all',
  );
  assert.deepEqual(
    runner.started,
    ['solo', 'chain-head', 'chain-mid', 'chain-tail'],
    'chain-head has a dependent on the cycle, so its longest downstream path is never computed, yet it was dispatched ahead of solo on a length relaxed in from the one dependent that did resolve: an unreachable marker that doubles as the identity element of the relaxation makes a half-walked length indistinguishable from a measured one, so an id the pass never finished outranks an id it did',
  );
  assert.equal(
    result.ok,
    false,
    'this graph is unsatisfiable by construction, so the order asserted above is the order of the branch that can run, never a claim that a height predicts whether a node runs at all',
  );
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

test('a failed node blocks its transitive dependents with a named cause and leaves independent branches untouched', async () => {
  const runner = gatedDispatcher((id) => (id === 'root' ? { ok: false, outcome: 'exit-nonzero' } : { ok: true, outcome: 'success' }));
  const result = await runGraph(
    {
      nodes: [{ id: 'root' }, { id: 'child' }, { id: 'grandchild' }, { id: 'other' }, { id: 'other-child' }],
      readyAfter: { child: ['root'], grandchild: ['child'], 'other-child': ['other'] },
    },
    runner.dispatchFn,
    {},
  );
  const records = byId(result.records);
  assert.equal(result.ok, false);
  assert.equal(records.get('root').state, 'failed');
  assert.equal(records.get('root').outcome, 'exit-nonzero');
  assert.equal(records.get('child').state, 'blocked');
  assert.equal(records.get('child').reason, 'dependency-failed');
  assert.deepEqual(records.get('child').blockedBy, ['root']);
  assert.equal(records.get('grandchild').state, 'blocked');
  assert.equal(records.get('grandchild').reason, 'dependency-blocked');
  assert.deepEqual(records.get('grandchild').blockedBy, ['child']);
  assert.equal(records.get('other').state, 'ok');
  assert.equal(records.get('other-child').state, 'ok');
  assert.ok(runner.started.includes('other-child'), 'an independent branch must still run after an unrelated failure');
  assert.ok(!runner.started.includes('child'), 'a blocked node is never dispatched');
});

test('a dispatchFn that throws is recorded as a failed node and its dependents are blocked', async () => {
  const dispatchFn = async (node) => {
    if (node.id === 'boom') throw new Error('the adapter exploded');
    return { ok: true, outcome: 'success' };
  };
  const result = await runGraph(
    { nodes: [{ id: 'boom' }, { id: 'after' }, { id: 'apart' }], readyAfter: { after: ['boom'] } },
    dispatchFn,
    {},
  );
  const records = byId(result.records);
  assert.equal(records.get('boom').state, 'failed');
  assert.equal(records.get('boom').outcome, 'dispatch-threw');
  assert.match(records.get('boom').reason, /the adapter exploded/);
  assert.equal(records.get('after').state, 'blocked');
  assert.equal(records.get('apart').state, 'ok');
});

test('a dispatchFn result that carries no boolean ok is recorded as a contract violation rather than believed', async () => {
  for (const verdict of [{}, null, undefined, 'ok', ['ok'], { ok: 'true' }]) {
    const result = await runGraph(
      { nodes: [{ id: 'one' }, { id: 'after' }], readyAfter: { after: ['one'] } },
      async () => verdict,
      {},
    );
    const records = byId(result.records);
    assert.equal(records.get('one').state, 'failed', `verdict ${JSON.stringify(verdict)} must not read as success`);
    assert.equal(records.get('one').outcome, 'dispatch-contract-violation');
    assert.match(records.get('one').reason, /rather than a verdict carrying a boolean ok/);
    assert.equal(records.get('after').state, 'blocked');
  }
});

test('a slow node does not block an unrelated satisfied branch, and the wave diagnostic that would have gated it drives nothing', async () => {
  const slowGate = deferred();
  const started = [];
  const dispatchFn = async (node) => {
    started.push(node.id);
    if (node.id === 'slow') await slowGate.promise;
    if (node.id === 'after-fast') slowGate.resolve();
    return { ok: true, outcome: 'success' };
  };
  const result = await settledWithin(
    runGraph(
      {
        nodes: [{ id: 'after-fast' }, { id: 'fast' }, { id: 'slow' }],
        readyAfter: { 'after-fast': ['fast'] },
      },
      dispatchFn,
      { concurrency: 8 },
    ),
    5000,
    'a barrier scheduler deadlocks here: after-fast can only start while slow is still in flight, and slow is only released by after-fast',
  );
  assert.equal(result.ok, true);
  assert.ok(started.indexOf('after-fast') > started.indexOf('slow'), 'slow must already be in flight when after-fast starts');
  assert.deepEqual(result.diagnostics.waves, [['fast', 'slow'], ['after-fast']]);
  assert.deepEqual(result.diagnostics.unlayered, []);
});

test('a record is emitted at dispatch start, before the node settles', async () => {
  const seen = [];
  const gate = deferred();
  const dispatchFn = async (node) => {
    if (node.id === 'held') {
      assert.deepEqual(seen.map((record) => `${record.id}:${record.state}`), ['held:running'], 'the start record must exist before the node settles, so a crash mid-flight still leaves a record');
      await gate.promise;
    }
    return { ok: true, outcome: 'success' };
  };
  const pending = runGraph({ nodes: [{ id: 'held' }], readyAfter: {} }, dispatchFn, {
    concurrency: 1,
    onRecord: (record) => { seen.push(record); },
  });
  gate.resolve();
  const result = await pending;
  assert.deepEqual(seen.map((record) => `${record.id}:${record.state}`), ['held:running', 'held:ok']);
  assert.deepEqual(seen.map((record) => record.sequence), [0, 1]);
  assert.equal(result.records[0].state, 'ok');
  assert.equal(Object.isFrozen(seen[0]), true, 'an emitted record must be frozen so a consumer cannot rewrite history');
});

test('an abort terminates every in-flight child for real and records both the in-flight and the never-dispatched nodes', async () => {
  const pidDir = scratch();
  const env = pidRecordingStub(pidDir);
  const controller = new AbortController();
  const started = [];
  const dispatchFn = (node, context) => {
    started.push(node.id);
    return dispatch({ prompt: node.id, timeoutMs: 60000, signal: context.signal }, { env, killGraceMs: 30000 });
  };
  const pending = runGraph(
    { nodes: [{ id: 'alpha' }, { id: 'bravo' }, { id: 'charlie' }, { id: 'delta' }], readyAfter: {} },
    dispatchFn,
    { concurrency: 2, signal: controller.signal },
  );
  await waitUntil(() => existsSync(join(pidDir, 'alpha')) && existsSync(join(pidDir, 'bravo')), 10000, 'the two in-flight children never started');
  const pids = ['alpha', 'bravo'].map((id) => Number(readFileSync(join(pidDir, id), 'utf8')));
  controller.abort();
  const result = await settledWithin(pending, 15000, 'an aborted run must settle rather than wait on children it has terminated');
  const records = byId(result.records);
  assert.equal(result.ok, false);
  assert.deepEqual([...started].sort(), ['alpha', 'bravo'], 'the cap admits the first two node ids in sorted order and no others may ever be dispatched');
  for (const id of ['alpha', 'bravo']) {
    assert.equal(records.get(id).state, 'cancelled');
    assert.equal(records.get(id).reason, 'aborted-in-flight');
  }
  for (const id of ['charlie', 'delta']) {
    assert.equal(records.get(id).state, 'cancelled', `${id} was never dispatched and must still leave a record`);
    assert.equal(records.get(id).reason, 'aborted-before-dispatch');
  }
  for (const pid of pids) await waitUntil(() => !alive(pid), 10000, `the child ${pid} survived the abort`);
  for (const id of ['alpha', 'bravo']) {
    assert.equal(
      existsSync(join(pidDir, `${id}.sigterm`)),
      true,
      `${id} was never sent SIGTERM: the kill grace is 30s here, so a child that died inside the assertion window died of a signal it could not trap, and an agent killed mid-write leaves a partial edit and a corrupt index on the shared tree`,
    );
  }
});

test('a node that resolves ok inside the abort window keeps its ok record', async () => {
  const controller = new AbortController();
  const gate = deferred();
  const dispatchFn = async (node) => {
    if (node.id === 'quick') {
      await gate.promise;
      return { ok: true, outcome: 'success' };
    }
    await new Promise((resolve) => { controller.signal.addEventListener('abort', resolve, { once: true }); });
    return { ok: false, outcome: 'aborted' };
  };
  const pending = runGraph(
    { nodes: [{ id: 'quick' }, { id: 'stuck' }], readyAfter: {} },
    dispatchFn,
    { concurrency: 2, signal: controller.signal },
  );
  controller.abort();
  gate.resolve();
  const result = await settledWithin(pending, 5000, 'the aborted run must settle');
  const records = byId(result.records);
  assert.equal(records.get('quick').state, 'ok', 'a genuine success inside the abort window is a result, not a casualty');
  assert.equal(records.get('stuck').state, 'cancelled');
  assert.equal(records.get('stuck').reason, 'aborted-in-flight');
});

test('an onRecord that throws aborts the run, terminates the in-flight child and rethrows', async () => {
  const pidDir = scratch();
  const env = pidRecordingStub(pidDir);
  const seen = [];
  const dispatchFn = async (node, context) => {
    if (node.id === 'child') {
      return dispatch({ prompt: node.id, timeoutMs: 60000, signal: context.signal }, { env, killGraceMs: 200 });
    }
    await waitUntil(() => existsSync(join(pidDir, 'child')), 10000, 'the real child never started');
    return { ok: true, outcome: 'success' };
  };
  const failure = await settledWithin(
    runGraph(
      { nodes: [{ id: 'child' }, { id: 'trigger' }], readyAfter: {} },
      dispatchFn,
      {
        concurrency: 2,
        onRecord: (record) => {
          seen.push(`${record.id}:${record.state}`);
          if (record.state === 'ok') throw new Error('the observer could not persist the record');
        },
      },
    ),
    20000,
    'an observer failure must abort and settle, never hang',
  );
  assert.ok(failure instanceof Error, 'runGraph must reject rather than resolve when its observer throws');
  assert.match(failure.message, /options\.onRecord threw while the run was recording a node/);
  assert.match(failure.message, /the observer could not persist the record/);
  assert.deepEqual(seen.slice(0, 3), ['child:running', 'trigger:running', 'trigger:ok']);
  const pid = Number(readFileSync(join(pidDir, 'child'), 'utf8'));
  await waitUntil(() => !alive(pid), 10000, 'the observer failure orphaned the child instead of terminating it');
});

test('the CLI runs a real graph end to end through the dispatch adapter and prints its records with exit 0', async () => {
  const env = stubEnv([
    'const prompt = process.argv[process.argv.length - 1];',
    "process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: `ran ${prompt}`, usage: {}, total_cost_usd: 0 }));",
  ].join('\n'));
  const graphPath = fixture('graph.json', {
    nodes: [
      { id: 'root', request: { prompt: 'do the root' } },
      { id: 'leaf', request: { prompt: 'do the leaf' } },
    ],
    readyAfter: { leaf: ['root'] },
  });
  const run = await runCli([graphPath, '--concurrency', '2'], env);
  assert.equal(run.code, 0, `the CLI failed: ${run.stderr}`);
  const printed = JSON.parse(run.stdout);
  assert.equal(printed.ok, true);
  assert.deepEqual(printed.records.map((record) => record.id), ['leaf', 'root']);
  assert.deepEqual(printed.records.map((record) => record.state), ['ok', 'ok']);
  assert.equal(printed.diagnostics.concurrency, 2);
  assert.deepEqual(printed.diagnostics.waves, [['root'], ['leaf']]);
});

test('the abort census is identical whichever in-flight child settles first', async () => {
  const graph = {
    nodes: [{ id: 'alpha' }, { id: 'bravo' }, { id: 'x' }, { id: 'y' }],
    readyAfter: { x: ['alpha'], y: ['bravo'] },
  };
  async function runReleasing(first) {
    const controller = new AbortController();
    const gates = new Map([['alpha', deferred()], ['bravo', deferred()]]);
    const running = new Set();
    const dispatchFn = async (node) => {
      running.add(node.id);
      await gates.get(node.id).promise;
      return { ok: false, outcome: 'aborted' };
    };
    const pending = runGraph(graph, dispatchFn, { concurrency: 2, signal: controller.signal });
    await waitUntil(() => running.size === 2, 5000, 'both roots never reached the dispatcher');
    controller.abort();
    gates.get(first).resolve();
    await new Promise((resolve) => { setImmediate(resolve); });
    gates.get(first === 'alpha' ? 'bravo' : 'alpha').resolve();
    return settledWithin(pending, 5000, 'the aborted run must settle');
  }
  const alphaFirst = await runReleasing('alpha');
  const bravoFirst = await runReleasing('bravo');
  assert.deepEqual(
    bravoFirst.records,
    alphaFirst.records,
    'the terminal classification of a never-dispatched node must not depend on which dying child settles first: a resume keyed on these records would re-dispatch a different node on each identical run',
  );
  for (const result of [alphaFirst, bravoFirst]) {
    const records = byId(result.records);
    for (const id of ['x', 'y']) {
      assert.equal(records.get(id).state, 'cancelled');
      assert.equal(records.get(id).reason, 'aborted-before-dispatch');
    }
    for (const id of ['alpha', 'bravo']) {
      assert.equal(records.get(id).state, 'cancelled');
      assert.equal(records.get(id).reason, 'aborted-in-flight');
    }
  }
});

test('a node that fails on its own verdict inside the abort window is recorded failed rather than cancelled', async () => {
  const controller = new AbortController();
  const gate = deferred();
  const dispatchFn = async (node) => {
    if (node.id === 'genuine') {
      await gate.promise;
      return { ok: false, outcome: 'exit-nonzero' };
    }
    await new Promise((resolve) => { controller.signal.addEventListener('abort', resolve, { once: true }); });
    return { ok: false, outcome: 'aborted' };
  };
  const pending = runGraph(
    { nodes: [{ id: 'genuine' }, { id: 'killed' }], readyAfter: {} },
    dispatchFn,
    { concurrency: 2, signal: controller.signal },
  );
  controller.abort();
  gate.resolve();
  const result = await settledWithin(pending, 5000, 'the aborted run must settle');
  const records = byId(result.records);
  assert.equal(
    records.get('genuine').state,
    'failed',
    'a node the pool never killed must keep the dispatcher verdict: relabelling it cancelled invites a resume to re-run a node that deterministically failed, over a tree already holding its partial edits',
  );
  assert.equal(records.get('genuine').outcome, 'exit-nonzero');
  assert.equal(records.get('genuine').reason, null);
  assert.equal(records.get('killed').state, 'cancelled');
  assert.equal(records.get('killed').outcome, 'aborted');
  assert.equal(records.get('killed').reason, 'aborted-in-flight');
});

test('a graph node that chooses where its child runs is refused before any child is spawned', async () => {
  const markerDir = scratch();
  const env = spawnRecordingStub(markerDir);
  const graphPath = fixture('escape.json', {
    nodes: [{ id: 'escape', request: { prompt: 'exfil', cwd: scratch() } }],
    readyAfter: {},
  });
  const run = await runCli([graphPath], env);
  assert.equal(run.code, 3, `expected the completed-with-failures exit, got ${run.code}: ${run.stderr}`);
  const record = JSON.parse(run.stdout).records[0];
  assert.equal(record.state, 'failed');
  assert.equal(record.outcome, 'dispatch-threw');
  assert.match(record.reason, /which the pool refuses to forward/);
  assert.equal(
    existsSync(join(markerDir, 'spawned')),
    false,
    'the graph file chose the working directory of a spawned agent, so a file built from untrusted prose can root an agent anywhere on the machine and escape the worktree isolation the pool exists to hold',
  );
});

test('a graph node that asks to outlive the pool ceiling is refused before any child is spawned', async () => {
  const markerDir = scratch();
  const env = spawnRecordingStub(markerDir);
  const graphPath = fixture('forever.json', {
    nodes: [{ id: 'forever', request: { prompt: 'wait', timeoutMs: 2147483647 } }],
    readyAfter: {},
  });
  const run = await runCli([graphPath], env);
  assert.equal(run.code, 3, `expected the completed-with-failures exit, got ${run.code}: ${run.stderr}`);
  const record = JSON.parse(run.stdout).records[0];
  assert.equal(record.state, 'failed');
  assert.match(record.reason, /may only choose an integer in 1\.\.3600000/);
  assert.equal(existsSync(join(markerDir, 'spawned')), false, 'a child that outlives the pool keeps writing to the shared tree long after the operator believes the run stopped');
});

test('an interrupted CLI terminates its in-flight child and still records the run', async () => {
  const pidDir = scratch();
  const env = pidRecordingStub(pidDir);
  const graphPath = fixture('long.json', { nodes: [{ id: 'long', request: { prompt: 'long' } }], readyAfter: {} });
  const started = startCli([graphPath], env);
  await waitUntil(() => existsSync(join(pidDir, 'long')), 15000, 'the child never started');
  const pid = Number(readFileSync(join(pidDir, 'long'), 'utf8'));
  strayPids.push(pid);
  started.child.kill('SIGINT');
  const run = await started.done;
  await waitUntil(() => !alive(pid), 15000, `the interrupted pool orphaned the agent child ${pid}, which keeps writing to the shared tree after the operator believes the run stopped`);
  assert.equal(run.code, 3, `expected the completed-with-failures exit, got ${run.code}: ${run.stderr}`);
  const printed = JSON.parse(run.stdout);
  assert.equal(printed.ok, false);
  assert.equal(printed.records[0].state, 'cancelled');
  assert.equal(printed.records[0].reason, 'aborted-in-flight');
});

test('the CLI never writes a control byte read from the graph file to the operator terminal', async () => {
  const path = join(scratch(), 'hostile.json');
  writeFileSync(path, `${ESCAPE}]0;PWNED${BELL}{"nodes":`);
  const run = await runCli([path], process.env);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /^pool error: /);
  assert.match(run.stderr, /PWNED/, 'the parser fragment must still reach the operator, or this assertion passes for the wrong reason');
  assert.equal(
    CONTROL_BYTE.test(run.stderr.replace(/\n$/, '')),
    false,
    'a control byte from the graph file reached the terminal, where an OSC sequence rewrites the window title and an erase sequence overwrites the line above it',
  );
});

test('a dispatcher failure message is stripped and bounded before it becomes a record', async () => {
  const dispatchFn = async () => { throw new Error(`start${BELL}${'x'.repeat(8192)}`); };
  const result = await runGraph({ nodes: [{ id: 'one' }], readyAfter: {} }, dispatchFn, {});
  const reason = result.records[0].reason;
  assert.equal(CONTROL_BYTE.test(reason), false, 'a control byte from the dispatcher reached the record verbatim');
  assert.ok(reason.length < 1100, `an unbounded dispatcher message became the record body at ${reason.length} characters`);
  assert.match(reason, /^start /);
});

test('a concurrency token that is not a plain decimal is a usage error rather than a silently different cap', async () => {
  const env = stubEnv('process.exit(9);');
  const graphPath = fixture('one.json', { nodes: [{ id: 'a', request: { prompt: 'a' } }], readyAfter: {} });
  for (const token of ['0x8', '', '1e1', '2.0', ' 3', '+3']) {
    const run = await runCli([graphPath, '--concurrency', token], env);
    assert.equal(run.code, 2, `--concurrency ${JSON.stringify(token)} must land on the usage exit, got ${run.code}: ${run.stderr}`);
    assert.match(run.stderr, /usage: pool\.mjs/);
    assert.equal(run.stdout, '');
  }
});

test('the CLI exits 3 when the run completes with a node that is not ok', async () => {
  const env = stubEnv('process.exit(7);');
  const graphPath = fixture('failing-graph.json', {
    nodes: [{ id: 'root', request: { prompt: 'fail me' } }, { id: 'leaf', request: { prompt: 'never' } }],
    readyAfter: { leaf: ['root'] },
  });
  const run = await runCli([graphPath], env);
  assert.equal(run.code, 3, `expected the completed-with-failures exit, got ${run.code}: ${run.stderr}`);
  const printed = JSON.parse(run.stdout);
  assert.equal(printed.ok, false);
  assert.equal(printed.records.find((record) => record.id === 'root').state, 'failed');
  assert.equal(printed.records.find((record) => record.id === 'leaf').state, 'blocked');
});
