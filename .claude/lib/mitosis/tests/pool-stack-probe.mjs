import { runGraph } from '../pool.mjs';

const SINK_HEIGHT = 1;
const UNREACHABLE_HEIGHT = 0;
const PROBE_SEED_DEPTH = 64;
const PROBE_CEILING_DEPTH = 262144;
const PROBE_GROWTH = 2;
const ID_PREFIX = 'n';
const ID_PAD = '0';
const OK_VERDICT = Object.freeze({ ok: true, outcome: 'success' });
const NO_FAILURE = null;
const UNKNOWN_FAILURE = 'unknown failure';

function chainIds(depth) {
  const width = String(depth - 1).length;
  return Object.freeze(Array.from(
    { length: depth },
    (ignored, index) => `${ID_PREFIX}${String(index).padStart(width, ID_PAD)}`,
  ));
}

function chainEdges(ids) {
  return Object.fromEntries(ids.slice(1).map((id, index) => [id, Object.freeze([ids[index]])]));
}

function dependentsOf(ids, edges) {
  const dependents = new Map(ids.map((id) => [id, []]));
  for (const id of ids) {
    if (!Object.hasOwn(edges, id)) continue;
    for (const dep of edges[id]) dependents.get(dep).push(id);
  }
  return dependents;
}

function recursiveHeights(ids, dependents) {
  const heights = new Map();
  const walking = new Set();
  const walk = (id) => {
    const memoized = heights.get(id);
    if (memoized !== undefined) return memoized;
    if (walking.has(id)) return UNREACHABLE_HEIGHT;
    walking.add(id);
    let height = SINK_HEIGHT;
    for (const dependent of dependents.get(id)) height = Math.max(height, walk(dependent) + 1);
    walking.delete(id);
    heights.set(id, height);
    return height;
  };
  for (const id of ids) walk(id);
  return heights;
}

function recursionThrowsAt(depth) {
  const ids = chainIds(depth);
  try {
    recursiveHeights(ids, dependentsOf(ids, chainEdges(ids)));
    return false;
  } catch (error) {
    if (error instanceof RangeError) return true;
    throw error;
  }
}

function probeRecursionLimit() {
  let depth = PROBE_SEED_DEPTH;
  for (;;) {
    if (recursionThrowsAt(depth)) return Object.freeze({ depth, threw: true });
    if (depth >= PROBE_CEILING_DEPTH) return Object.freeze({ depth, threw: false });
    depth *= PROBE_GROWTH;
  }
}

async function dispatchChain(ids) {
  const started = [];
  try {
    const result = await runGraph(
      { nodes: ids.map((id) => ({ id })), readyAfter: chainEdges(ids) },
      async (node) => {
        started.push(node.id);
        return OK_VERDICT;
      },
      {},
    );
    return Object.freeze({ ok: result.ok === true, failure: NO_FAILURE, started });
  } catch (error) {
    const message = error === null || error === undefined ? UNKNOWN_FAILURE : String(error.message ?? error);
    return Object.freeze({ ok: false, failure: message, started });
  }
}

function report(fields) {
  process.stdout.write(`${JSON.stringify(fields)}\n`);
}

const probe = probeRecursionLimit();
if (probe.threw) {
  const ids = chainIds(probe.depth);
  const run = await dispatchChain(ids);
  report({
    depth: probe.depth,
    recursiveThrew: true,
    poolOk: run.ok,
    poolFailure: run.failure,
    orderMatched: run.started.length === ids.length && run.started.every((id, index) => id === ids[index]),
  });
} else {
  report({
    depth: probe.depth,
    recursiveThrew: false,
    poolOk: false,
    poolFailure: NO_FAILURE,
    orderMatched: false,
  });
}
