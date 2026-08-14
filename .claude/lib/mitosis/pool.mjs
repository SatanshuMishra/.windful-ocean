import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dispatch } from './dispatch.mjs';
import { BUILD_AHEAD_CAP } from './window.mjs';

const NODE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const SINK_HEIGHT = 1;
const UNREACHABLE_HEIGHT = 0;
const STATE_PENDING = 'pending';
const STATE_RUNNING = 'running';
const STATE_OK = 'ok';
const STATE_FAILED = 'failed';
const STATE_BLOCKED = 'blocked';
const STATE_CANCELLED = 'cancelled';
const REASON_DEPENDENCY_FAILED = 'dependency-failed';
const REASON_DEPENDENCY_BLOCKED = 'dependency-blocked';
const REASON_DEPENDENCY_CANCELLED = 'dependency-cancelled';
const REASON_UNSATISFIABLE = 'unsatisfiable';
const REASON_ABORTED_IN_FLIGHT = 'aborted-in-flight';
const REASON_ABORTED_BEFORE_DISPATCH = 'aborted-before-dispatch';
const OUTCOME_THREW = 'dispatch-threw';
const OUTCOME_CONTRACT_VIOLATION = 'dispatch-contract-violation';
const OUTCOME_ABORTED = 'aborted';
const NO_IDS = Object.freeze([]);
const USAGE = 'usage: pool.mjs <graph.json> [--concurrency N]';
const CONCURRENCY_FLAG = '--concurrency';
const CONCURRENCY_TOKEN_PATTERN = /^[1-9][0-9]*$/;
const INTERRUPT_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM']);
const NODE_REQUEST_FIELDS = Object.freeze(['prompt', 'agentType', 'model', 'effort', 'schema', 'timeoutMs']);
const NODE_TIMEOUT_CAP_MS = 3600000;
const MESSAGE_CAP_CHARS = 1024;
const TAIL_ELISION = '[tail elided]';
const CONTROL_CHARACTERS = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}-${String.fromCharCode(159)}]`, 'g');
const EXIT_ERROR = 1;
const EXIT_USAGE = 2;
const EXIT_INCOMPLETE = 3;

function describeError(error) {
  if (error === null || error === undefined) return 'unknown failure';
  if (typeof error.message === 'string' && error.message !== '') return error.message;
  return String(error);
}

function note(text) {
  const safe = text.replace(CONTROL_CHARACTERS, ' ');
  return safe.length <= MESSAGE_CAP_CHARS ? safe : `${safe.slice(0, MESSAGE_CAP_CHARS)}${TAIL_ELISION}`;
}

function requirePlainObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`pool: ${field} must be a non-null, non-array object, received ${value === null ? 'null' : typeof value}`);
  }
  return value;
}

function indexNodes(nodes) {
  const byId = new Map();
  for (const node of nodes) {
    requirePlainObject(node, 'every graph node');
    if (typeof node.id !== 'string' || !NODE_ID_PATTERN.test(node.id)) {
      throw new TypeError(`pool: every graph node needs an id matching ${NODE_ID_PATTERN.source}, the same pattern the checkpoint refs are built from, so a node id can travel into a ref, a path and a record without escaping; received ${JSON.stringify(node.id)}`);
    }
    if (byId.has(node.id)) {
      throw new TypeError(`pool: two graph nodes share the id ${JSON.stringify(node.id)}, so a dependency naming it would be ambiguous and one of the two would silently never run`);
    }
    byId.set(node.id, node);
  }
  return byId;
}

function indexDependencies(readyAfter, byId) {
  requirePlainObject(readyAfter, 'graph.readyAfter');
  for (const key of Object.keys(readyAfter)) {
    if (byId.has(key)) continue;
    throw new TypeError(`pool: graph.readyAfter names ${JSON.stringify(key)}, which is not the id of any graph node, so its dependencies would gate nothing and the edge the caller believes it declared would not exist`);
  }
  const deps = new Map();
  for (const id of byId.keys()) {
    const declared = Object.hasOwn(readyAfter, id) ? readyAfter[id] : [];
    if (!Array.isArray(declared)) {
      throw new TypeError(`pool: graph.readyAfter[${JSON.stringify(id)}] must be an array of node ids, received ${declared === null ? 'null' : typeof declared}`);
    }
    for (const dep of declared) {
      if (byId.has(dep)) continue;
      throw new TypeError(`pool: node ${JSON.stringify(id)} is ready after ${JSON.stringify(dep)}, which is not the id of any graph node, so the node could never become dispatchable`);
    }
    deps.set(id, Object.freeze([...new Set(declared)]));
  }
  return deps;
}

function dependentCounts(order, deps) {
  const counts = new Map(order.map((id) => [id, 0]));
  for (const id of order) {
    for (const dep of deps.get(id)) counts.set(dep, counts.get(dep) + 1);
  }
  return counts;
}

function criticalPathHeights(order, deps) {
  const outstanding = dependentCounts(order, deps);
  const accumulated = new Map();
  const settled = [];
  for (const id of order) {
    if (outstanding.get(id) !== 0) continue;
    accumulated.set(id, SINK_HEIGHT);
    settled.push(id);
  }
  for (let cursor = 0; cursor < settled.length; cursor += 1) {
    const id = settled[cursor];
    for (const dep of deps.get(id)) {
      accumulated.set(dep, Math.max(accumulated.get(dep) ?? SINK_HEIGHT, accumulated.get(id) + 1));
      const remaining = outstanding.get(dep) - 1;
      outstanding.set(dep, remaining);
      if (remaining === 0) settled.push(dep);
    }
  }
  const resolved = new Set(settled);
  return new Map(order.map((id) => [id, resolved.has(id) ? accumulated.get(id) : UNREACHABLE_HEIGHT]));
}

function priorityOrder(order, heights) {
  return Object.freeze([...order].sort((left, right) => {
    const leftHeight = heights.get(left);
    const rightHeight = heights.get(right);
    if (leftHeight === undefined || rightHeight === undefined) {
      throw new Error(`pool: the ordering pass carries no height for ${JSON.stringify(leftHeight === undefined ? left : right)}, so the two ids it was asked to compare cannot be ranked; a comparator that subtracts a missing height returns NaN, which sort reads as "these two are equal", and the whole priority collapses back to input order with nothing thrown and nothing logged`);
    }
    const byHeight = rightHeight - leftHeight;
    if (byHeight !== 0) return byHeight;
    return left < right ? -1 : 1;
  }));
}

function validateGraph(graph) {
  requirePlainObject(graph, 'graph');
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    throw new TypeError(`pool: graph.nodes must be a non-empty array of nodes, received ${Array.isArray(graph.nodes) ? 'an empty array' : typeof graph.nodes}`);
  }
  const byId = indexNodes(graph.nodes);
  const deps = indexDependencies(graph.readyAfter, byId);
  const order = Object.freeze([...byId.keys()].sort());
  return Object.freeze({ order, priority: priorityOrder(order, criticalPathHeights(order, deps)), byId, deps });
}

function requireAbortSignal(signal) {
  if (signal === undefined || signal === null) return null;
  const usable = typeof signal === 'object'
    && typeof signal.addEventListener === 'function'
    && typeof signal.removeEventListener === 'function'
    && typeof signal.aborted === 'boolean';
  if (!usable) {
    throw new TypeError('pool: options.signal must be an AbortSignal carrying aborted, addEventListener and removeEventListener, because the pool forwards it to every dispatch so an abort reaches the children rather than only the scheduler');
  }
  return signal;
}

function requireConcurrency(value) {
  if (value === undefined || value === null) return BUILD_AHEAD_CAP;
  if (!Number.isInteger(value) || value < 1 || value > BUILD_AHEAD_CAP) {
    throw new RangeError(`pool: options.concurrency must be an integer in 1..${BUILD_AHEAD_CAP}: the override may only NARROW the pool, never widen it past the engine cap, received ${JSON.stringify(value)}`);
  }
  return value;
}

function resolveOptions(options) {
  requirePlainObject(options, 'options');
  if (options.onRecord !== undefined && typeof options.onRecord !== 'function') {
    throw new TypeError(`pool: options.onRecord must be a function the pool can call once at dispatch start and once at settle for every node, received ${typeof options.onRecord}`);
  }
  return Object.freeze({
    concurrency: requireConcurrency(options.concurrency),
    signal: requireAbortSignal(options.signal),
    onRecord: options.onRecord === undefined ? null : options.onRecord,
  });
}

function requireDispatchFn(dispatchFn) {
  if (typeof dispatchFn !== 'function') {
    throw new TypeError(`pool: dispatchFn must be a function the pool calls once per node, received ${typeof dispatchFn}`);
  }
  return dispatchFn;
}

function makeLedger(plan, onRecord, onEmitFailure) {
  const states = new Map(plan.order.map((id) => [id, STATE_PENDING]));
  const records = new Map();
  let sequence = 0;
  const emit = (record) => {
    if (onRecord === null) return;
    try {
      onRecord(record);
    } catch (error) {
      onEmitFailure(error);
    }
  };
  return {
    states,
    records,
    start(id) {
      states.set(id, STATE_RUNNING);
      emit(Object.freeze({ id, state: STATE_RUNNING, sequence: sequence++, outcome: null, blockedBy: NO_IDS, reason: null }));
    },
    settle(id, state, outcome, blockedBy, reason) {
      const record = Object.freeze({ id, state, outcome, blockedBy: Object.freeze([...blockedBy]), reason });
      states.set(id, state);
      records.set(id, record);
      emit(Object.freeze({ ...record, sequence: sequence++ }));
    },
  };
}

function readyIds(plan, ledger) {
  return plan.priority.filter((id) => ledger.states.get(id) === STATE_PENDING
    && plan.deps.get(id).every((dep) => ledger.states.get(dep) === STATE_OK));
}

function pendingIds(plan, ledger) {
  return plan.order.filter((id) => ledger.states.get(id) === STATE_PENDING);
}

function markUnsatisfiable(plan, ledger) {
  for (const id of pendingIds(plan, ledger)) {
    const unmet = plan.deps.get(id).filter((dep) => ledger.states.get(dep) !== STATE_OK);
    ledger.settle(id, STATE_BLOCKED, null, unmet, REASON_UNSATISFIABLE);
  }
}

function cancelPending(plan, ledger) {
  for (const id of pendingIds(plan, ledger)) {
    ledger.settle(id, STATE_CANCELLED, null, NO_IDS, REASON_ABORTED_BEFORE_DISPATCH);
  }
}

function censusOrThrow(plan, ledger) {
  const unrecorded = plan.order.filter((id) => !ledger.records.has(id));
  if (unrecorded.length > 0) {
    throw new Error(`pool: the run ended with no terminal record for ${unrecorded.join(', ')}, which would be a silent drop of work the caller asked for; every node leaves a run with exactly one record, even when it never ran`);
  }
  return Object.freeze(plan.order.map((id) => ledger.records.get(id)));
}

function isVerdict(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && typeof value.ok === 'boolean';
}

function blockedReasonFor(state) {
  if (state === STATE_FAILED) return REASON_DEPENDENCY_FAILED;
  if (state === STATE_CANCELLED) return REASON_DEPENDENCY_CANCELLED;
  return REASON_DEPENDENCY_BLOCKED;
}

function propagateBlock(plan, ledger, causeId, causeState) {
  const queue = [[causeId, blockedReasonFor(causeState)]];
  while (queue.length > 0) {
    const [cause, reason] = queue.shift();
    for (const id of plan.order) {
      if (ledger.states.get(id) !== STATE_PENDING) continue;
      if (!plan.deps.get(id).includes(cause)) continue;
      ledger.settle(id, STATE_BLOCKED, null, [cause], reason);
      queue.push([id, REASON_DEPENDENCY_BLOCKED]);
    }
  }
}

function finish(plan, ledger, aborted, id, ok, outcome, reason) {
  if (ok) {
    ledger.settle(id, STATE_OK, outcome, NO_IDS, null);
    return;
  }
  const cancelled = outcome === OUTCOME_ABORTED;
  const state = cancelled ? STATE_CANCELLED : STATE_FAILED;
  ledger.settle(id, state, outcome, NO_IDS, cancelled ? REASON_ABORTED_IN_FLIGHT : reason);
  if (aborted) return;
  propagateBlock(plan, ledger, id, state);
}

async function invoke(plan, ledger, signal, dispatchFn, id) {
  let verdict = null;
  try {
    verdict = await dispatchFn(plan.byId.get(id), { signal });
  } catch (error) {
    finish(plan, ledger, signal.aborted, id, false, OUTCOME_THREW, note(describeError(error)));
    return;
  }
  if (!isVerdict(verdict)) {
    finish(plan, ledger, signal.aborted, id, false, OUTCOME_CONTRACT_VIOLATION, `pool: dispatchFn returned ${verdict === null ? 'null' : typeof verdict} for node ${JSON.stringify(id)} rather than a verdict carrying a boolean ok, so the node's success can neither be believed nor propagated to its dependents`);
    return;
  }
  finish(plan, ledger, signal.aborted, id, verdict.ok, typeof verdict.outcome === 'string' ? verdict.outcome : null, null);
}

async function drive(plan, ledger, settings, signal, dispatchFn) {
  const inFlight = new Map();
  let peak = 0;
  for (;;) {
    if (signal.aborted) cancelPending(plan, ledger);
    for (const id of readyIds(plan, ledger)) {
      if (inFlight.size >= settings.concurrency) break;
      ledger.start(id);
      const settled = () => { inFlight.delete(id); };
      inFlight.set(id, invoke(plan, ledger, signal, dispatchFn, id).then(settled, settled));
      peak = Math.max(peak, inFlight.size);
    }
    if (inFlight.size > 0) {
      await Promise.race([...inFlight.values()]);
      continue;
    }
    if (pendingIds(plan, ledger).length === 0) return peak;
    markUnsatisfiable(plan, ledger);
    return peak;
  }
}

function layerGraph(order, deps) {
  const placed = new Set();
  const waves = [];
  for (;;) {
    const layer = order.filter((id) => !placed.has(id) && deps.get(id).every((dep) => placed.has(dep)));
    if (layer.length === 0) break;
    waves.push(Object.freeze(layer));
    for (const id of layer) placed.add(id);
  }
  return Object.freeze({
    waves: Object.freeze(waves),
    unlayered: Object.freeze(order.filter((id) => !placed.has(id))),
  });
}

export async function runGraph(graph, dispatchFn, options = {}) {
  const plan = validateGraph(graph);
  const settings = resolveOptions(options);
  requireDispatchFn(dispatchFn);
  const controller = new AbortController();
  const relay = () => controller.abort();
  let fatal = null;
  const ledger = makeLedger(plan, settings.onRecord, (error) => {
    if (fatal === null) fatal = error;
    controller.abort();
  });
  if (settings.signal !== null && settings.signal.aborted) controller.abort();
  if (settings.signal !== null) settings.signal.addEventListener('abort', relay, { once: true });
  let peak = 0;
  try {
    peak = await drive(plan, ledger, settings, controller.signal, dispatchFn);
  } finally {
    if (settings.signal !== null) settings.signal.removeEventListener('abort', relay);
  }
  if (fatal !== null) {
    throw new Error(`pool: options.onRecord threw while the run was recording a node, so the run was aborted and every in-flight child terminated rather than left orphaned over a shared tree: ${describeError(fatal)}`);
  }
  const records = censusOrThrow(plan, ledger);
  const layered = layerGraph(plan.order, plan.deps);
  return Object.freeze({
    ok: records.every((record) => record.state === STATE_OK),
    records,
    diagnostics: Object.freeze({
      nodeCount: plan.order.length,
      concurrency: settings.concurrency,
      peakConcurrency: peak,
      waves: layered.waves,
      unlayered: layered.unlayered,
    }),
  });
}

function parseArgs(argv) {
  const [file, ...rest] = argv.slice(2);
  if (file === undefined || file.startsWith('-')) return null;
  if (rest.length === 0) return Object.freeze({ file, concurrency: undefined });
  if (rest.length !== 2 || rest[0] !== CONCURRENCY_FLAG) return null;
  if (!CONCURRENCY_TOKEN_PATTERN.test(rest[1])) return null;
  return Object.freeze({ file, concurrency: Number(rest[1]) });
}

function requireNodeTimeout(value, id) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > NODE_TIMEOUT_CAP_MS) {
    throw new RangeError(`pool: node ${JSON.stringify(id)} asks for a timeoutMs of ${JSON.stringify(value)}, but a graph file may only choose an integer in 1..${NODE_TIMEOUT_CAP_MS}: a child allowed to outlive the pool by days keeps writing to the shared tree long after the operator believes the run stopped`);
  }
  return value;
}

function nodeRequest(node) {
  const request = requirePlainObject(node.request, `node ${JSON.stringify(node.id)}.request`);
  const picked = {};
  for (const key of Object.keys(request)) {
    if (!NODE_REQUEST_FIELDS.includes(key)) {
      throw new TypeError(`pool: node ${JSON.stringify(node.id)} carries the request field ${JSON.stringify(key)}, which the pool refuses to forward: a graph file may only choose ${NODE_REQUEST_FIELDS.join(', ')}, never where its child runs, because a cwd or a worktree read from the file roots the spawned agent outside the tree the operator invoked the pool in`);
    }
    picked[key] = request[key];
  }
  return Object.freeze({ ...picked, timeoutMs: requireNodeTimeout(picked.timeoutMs, node.id) });
}

function dispatchNode(node, context) {
  return dispatch({ ...nodeRequest(node), signal: context.signal });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args === null) {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = EXIT_USAGE;
    return;
  }
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  for (const name of INTERRUPT_SIGNALS) process.on(name, interrupt);
  try {
    const graph = JSON.parse(readFileSync(args.file, 'utf8'));
    const result = await runGraph(graph, dispatchNode, { concurrency: args.concurrency, signal: controller.signal });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = EXIT_INCOMPLETE;
  } catch (error) {
    process.stderr.write(`pool error: ${note(describeError(error))}\n`);
    process.exitCode = EXIT_ERROR;
  } finally {
    for (const name of INTERRUPT_SIGNALS) process.off(name, interrupt);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
