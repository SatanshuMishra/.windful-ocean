import { buildUnitTable, dispositionOf, indexUnits, planTick } from './leases.mjs';
import { runGraph } from './pool.mjs';

export {
  acquire,
  buildUnitTable,
  dispositionOf,
  indexUnits,
  isBuildable,
  isDispatchable,
  makeUnit,
  overlapHolder,
  planTick,
} from './leases.mjs';

const PARKED = 'parked';

function markDispatched(units, dispatchIds) {
  const set = new Set(dispatchIds);
  return Object.freeze(units.map((u) => (set.has(u.id) ? Object.freeze({ ...u, state: 'dispatched', leaseHeld: true }) : u)));
}

function applyOutcomes(units, outcomes) {
  return Object.freeze(units.map((u) => (outcomes.has(u.id) ? Object.freeze({ ...u, state: dispositionOf(outcomes.get(u.id)), leaseHeld: false }) : u)));
}

function markAwaitingMerge(units) {
  return Object.freeze(units.map((u) => (u.state === 'awaiting' ? Object.freeze({ ...u, state: 'awaiting-merge' }) : u)));
}

function tickGraph(units) {
  return { nodes: units.map((unit) => ({ id: unit.id })), readyAfter: {} };
}

function tickDispatcher(unitsById, runUnit, outcomes) {
  return async (node, context) => {
    const outcome = await runUnit(unitsById.get(node.id), context);
    outcomes.set(node.id, outcome === undefined ? null : outcome);
    const disposition = dispositionOf(outcome);
    return { ok: disposition !== PARKED, outcome: disposition };
  };
}

function orNull(value) {
  return value === undefined ? null : value;
}

export async function joinTick(units, runUnit, options = {}) {
  const outcomes = new Map();
  await runGraph(
    tickGraph(units),
    tickDispatcher(indexUnits(units), runUnit, outcomes),
    { signal: orNull(options.signal), onRecord: options.onRecord },
  );
  return units.map((unit) => (outcomes.has(unit.id) ? outcomes.get(unit.id) : null));
}

function aborted(signal) {
  return signal !== null && signal !== undefined && signal.aborted === true;
}

export async function runScheduleTick(specs, runUnit, windowSize, options = {}) {
  let units = buildUnitTable(specs);
  const ticks = [];
  const dispatchedEpochs = new Set();
  for (;;) {
    if (aborted(options.signal)) return Object.freeze({ units, ticks, quiescent: false, aborted: true });
    const w = typeof windowSize === 'function' ? windowSize() : windowSize;
    const stateOf = new Map(units.map((u) => [u.id, u.state]));
    const epochOf = (id) => `${id}@${stateOf.get(id)}`;
    const dispatch = planTick(units, w).dispatch.filter((id) => !dispatchedEpochs.has(epochOf(id)));
    if (dispatch.length === 0) {
      units = markAwaitingMerge(units);
      return Object.freeze({ units, ticks, quiescent: true, aborted: false });
    }
    for (const id of dispatch) dispatchedEpochs.add(epochOf(id));
    ticks.push(dispatch);
    units = markDispatched(units, dispatch);
    const byId = indexUnits(units);
    const results = await joinTick(dispatch.map((id) => byId.get(id)), runUnit, options);
    units = applyOutcomes(units, new Map(dispatch.map((id, index) => [id, results[index]])));
  }
}

export async function runSchedule(specs, runUnit, opts, ...rest) {
  if (rest.length > 0) throw new Error('runSchedule: the bounded merge poll was deleted, so the third argument is now opts; a 4-argument call would bind undefined to opts and silently degrade the build-ahead window to its default cap');
  const windowSize = opts && (Number.isInteger(opts.window) || typeof opts.window === 'function') ? opts.window : undefined;
  return runScheduleTick(specs, runUnit, windowSize, {
    signal: opts && opts.signal !== undefined ? opts.signal : null,
    onRecord: opts && typeof opts.onRecord === 'function' ? opts.onRecord : undefined,
  });
}
