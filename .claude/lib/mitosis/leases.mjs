import { scopesOverlap } from './wave-planner.mjs';
import { BUILD_AHEAD_CAP } from './window.mjs';

export function makeUnit(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('unit spec must be an object');
  if (!spec.id || typeof spec.id !== 'string') throw new Error('unit spec missing string id');
  const prereqs = spec.prereqs === undefined ? [] : spec.prereqs;
  if (!Array.isArray(prereqs)) throw new Error(`unit ${spec.id} prereqs must be an array`);
  const fileScope = spec.fileScope === undefined ? [] : spec.fileScope;
  if (!Array.isArray(fileScope)) throw new Error(`unit ${spec.id} fileScope must be an array`);
  return Object.freeze({
    id: spec.id,
    state: spec.state || 'planned',
    prereqs: Object.freeze([...prereqs]),
    fileScope: Object.freeze([...fileScope]),
    leaseHeld: false,
  });
}

export function buildUnitTable(specs) {
  if (!Array.isArray(specs)) throw new Error('unit table must be an array');
  const units = specs.map(makeUnit);
  const ids = new Set();
  for (const u of units) {
    if (ids.has(u.id)) throw new Error(`duplicate unit id: ${u.id}`);
    ids.add(u.id);
  }
  for (const u of units)
    for (const p of u.prereqs)
      if (!ids.has(p)) throw new Error(`unit ${u.id} prereq references unknown unit: ${p}`);
  return Object.freeze(units);
}

export function indexUnits(units) {
  const byId = new Map();
  for (const u of units) byId.set(u.id, u);
  return byId;
}

export function overlapHolder(leases, fileScope, excludeId) {
  for (const [path, holder] of leases) {
    if (holder === excludeId) continue;
    if (scopesOverlap([path], fileScope)) return holder;
  }
  return null;
}

export function isDispatchable(unit, unitsById, leases) {
  if (unit.state === 'done' || unit.state === 'parked' || unit.state === 'awaiting' || unit.state === 'dispatched') return false;
  for (const pid of unit.prereqs) {
    const prereq = unitsById.get(pid);
    if (!prereq || prereq.state !== 'done') return false;
  }
  return overlapHolder(leases, unit.fileScope, unit.id) === null;
}

export function isBuildable(unit, unitsById, leases, window) {
  if (unit.state === 'done' || unit.state === 'parked' || unit.state === 'awaiting' || unit.state === 'dispatched' || unit.state === 'built') return false;
  for (const pid of unit.prereqs) {
    const prereq = unitsById.get(pid);
    if (!prereq || (prereq.state !== 'built' && prereq.state !== 'awaiting' && prereq.state !== 'done')) return false;
  }
  if (overlapHolder(leases, unit.fileScope, unit.id) !== null) return false;
  if (!window || !Number.isInteger(window.size)) return false;
  if (!Number.isInteger(window.builtUnmergedCount)) return false;
  return window.builtUnmergedCount < window.size;
}

export function acquire(leases, unit) {
  const next = new Map(leases);
  for (const path of unit.fileScope) next.set(path, unit.id);
  return next;
}

export function dispositionOf(outcome) {
  if (outcome && outcome.tag === 'Done') return 'done';
  if (outcome && outcome.tag === 'AwaitingApproval') return 'awaiting';
  if (outcome && outcome.tag === 'Built') return 'built';
  return 'parked';
}

function computeDependentCounts(units) {
  const directDependents = new Map(units.map((u) => [u.id, []]));
  for (const u of units)
    for (const p of u.prereqs)
      if (directDependents.has(p)) directDependents.get(p).push(u.id);
  const counts = new Map();
  for (const u of units) {
    const seen = new Set();
    const stack = [...directDependents.get(u.id)];
    while (stack.length > 0) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const next of directDependents.get(id)) stack.push(next);
    }
    counts.set(u.id, seen.size);
  }
  return counts;
}

function criticalPathOrder(units) {
  const counts = computeDependentCounts(units);
  return units
    .map((unit, index) => ({ unit, index }))
    .sort((a, b) => (counts.get(b.unit.id) - counts.get(a.unit.id)) || (a.index - b.index))
    .map((entry) => entry.unit);
}

function buildAheadWindow(units, windowSize) {
  return { builtUnmergedCount: units.filter((u) => u.state === 'built').length, size: Number.isInteger(windowSize) ? windowSize : BUILD_AHEAD_CAP };
}

export function planTick(units, windowSize) {
  const byId = indexUnits(units);
  let leases = new Map();
  const dispatch = [];
  const window = buildAheadWindow(units, windowSize);
  for (const unit of criticalPathOrder(units)) {
    if (isDispatchable(unit, byId, leases)) {
      dispatch.push(unit.id);
      leases = acquire(leases, unit);
    } else if (isBuildable(unit, byId, leases, window)) {
      dispatch.push(unit.id);
      leases = acquire(leases, unit);
    }
  }
  return { dispatch, leases };
}

function markDispatched(units, dispatchIds) {
  const set = new Set(dispatchIds);
  return Object.freeze(units.map((u) => (set.has(u.id) ? Object.freeze({ ...u, state: 'dispatched', leaseHeld: true }) : u)));
}

function applyOutcomes(units, outcomes) {
  return Object.freeze(units.map((u) => (outcomes.has(u.id) ? Object.freeze({ ...u, state: dispositionOf(outcomes.get(u.id)), leaseHeld: false }) : u)));
}

async function joinTick(units, runUnit) {
  const settled = await Promise.allSettled(units.map((u) => runUnit(u)));
  return settled.map((r) => (r.status === 'fulfilled' ? r.value : null));
}

function markAwaitingMerge(units) {
  return Object.freeze(units.map((u) => (u.state === 'awaiting' ? Object.freeze({ ...u, state: 'awaiting-merge' }) : u)));
}

async function runScheduleTick(specs, runUnit, windowSize) {
  let units = buildUnitTable(specs);
  const ticks = [];
  const dispatchedEpochs = new Set();
  for (;;) {
    const w = typeof windowSize === 'function' ? windowSize() : windowSize;
    const stateOf = new Map(units.map((u) => [u.id, u.state]));
    const epochOf = (id) => `${id}@${stateOf.get(id)}`;
    const dispatch = planTick(units, w).dispatch.filter((id) => !dispatchedEpochs.has(epochOf(id)));
    if (dispatch.length === 0) {
      units = markAwaitingMerge(units);
      return { units, ticks, quiescent: true };
    }
    for (const id of dispatch) dispatchedEpochs.add(epochOf(id));
    ticks.push(dispatch);
    units = markDispatched(units, dispatch);
    const byId = indexUnits(units);
    const dispatchUnits = dispatch.map((id) => byId.get(id));
    const results = await joinTick(dispatchUnits, runUnit);
    const outcomes = new Map(dispatch.map((id, i) => [id, results[i]]));
    units = applyOutcomes(units, outcomes);
  }
}

export async function runSchedule(specs, runUnit, opts, ...rest) {
  if (rest.length > 0) throw new Error('runSchedule: the bounded merge poll was deleted, so the third argument is now opts; a 4-argument call would bind undefined to opts and silently degrade the build-ahead window to its default cap');
  const windowSize = opts && (Number.isInteger(opts.window) || typeof opts.window === 'function') ? opts.window : undefined;
  return runScheduleTick(specs, runUnit, windowSize);
}
