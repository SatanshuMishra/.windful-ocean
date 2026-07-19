import { scopesOverlap } from './wave-planner.mjs';
import { classifyMergeWatch } from './merge-watch.mjs';
import { WINDOW_FLOOR } from './window.mjs';

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

export function mayRestack(state) {
  return state === 'built' || state === 'planned';
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
  return { builtUnmergedCount: units.filter((u) => u.state === 'built').length, size: Number.isInteger(windowSize) ? windowSize : WINDOW_FLOOR };
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

function awaitingUnits(units) {
  return units.filter((u) => u.state === 'awaiting');
}

export function progressPossible(units) {
  if (!units.some((u) => u.state === 'awaiting')) return false;
  const hypothetical = units.map((u) => (u.state === 'awaiting' ? { ...u, state: 'done' } : u));
  return planTick(hypothetical).dispatch.length > 0;
}

function markMerged(units, mergedIds) {
  const set = new Set(mergedIds);
  return Object.freeze(units.map((u) => (set.has(u.id) ? Object.freeze({ ...u, state: 'done', leaseHeld: false }) : u)));
}

function markAwaitingMerge(units) {
  return Object.freeze(units.map((u) => (u.state === 'awaiting' ? Object.freeze({ ...u, state: 'awaiting-merge' }) : u)));
}

async function runScheduleTick(specs, runUnit, poll, windowSize) {
  let units = buildUnitTable(specs);
  const ticks = [];
  const polls = [];
  const maxPollCycles = poll && Number.isInteger(poll.maxCycles) && poll.maxCycles > 0 ? poll.maxCycles : 0;
  const maxSteps = units.length * (maxPollCycles + 2) + 1;
  let pollsUsed = 0;
  for (let step = 0; step < maxSteps; step++) {
    const { dispatch } = planTick(units, windowSize);
    if (dispatch.length > 0) {
      ticks.push(dispatch);
      units = markDispatched(units, dispatch);
      const byId = indexUnits(units);
      const dispatchUnits = dispatch.map((id) => byId.get(id));
      const results = await joinTick(dispatchUnits, runUnit);
      const outcomes = new Map(dispatch.map((id, i) => [id, results[i]]));
      units = applyOutcomes(units, outcomes);
      continue;
    }
    if (poll && pollsUsed < maxPollCycles && progressPossible(units)) {
      pollsUsed++;
      const watching = awaitingUnits(units);
      const merged = [];
      for (const unit of watching) {
        const result = await poll.watch(unit);
        if (classifyMergeWatch(result)) {
          merged.push(unit.id);
          if (typeof poll.onMerged === 'function') await poll.onMerged(unit, result);
        }
      }
      polls.push({ cycle: pollsUsed, watched: watching.map((u) => u.id), merged });
      if (merged.length > 0) { units = markMerged(units, merged); pollsUsed = 0; }
      continue;
    }
    units = markAwaitingMerge(units);
    break;
  }
  return { units, ticks, polls };
}

function release(leases, unitId) {
  const next = new Map();
  for (const [path, holder] of leases) if (holder !== unitId) next.set(path, holder);
  return next;
}

function dispatchableStreaming(units, liveLeases, windowSize) {
  const byId = indexUnits(units);
  let leases = new Map(liveLeases);
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
  return dispatch;
}

async function runScheduleStreaming(specs, runUnit, poll, windowSize) {
  let units = buildUnitTable(specs);
  const ticks = [];
  const polls = [];
  const maxPollCycles = poll && Number.isInteger(poll.maxCycles) && poll.maxCycles > 0 ? poll.maxCycles : 0;
  const maxSteps = units.length * (maxPollCycles + 2) + 2;
  let pollsUsed = 0;
  let liveLeases = new Map();
  const running = new Map();
  for (let step = 0; step < maxSteps; step++) {
    const dispatch = dispatchableStreaming(units, liveLeases, windowSize);
    if (dispatch.length > 0) {
      ticks.push(dispatch);
      units = markDispatched(units, dispatch);
      const byId = indexUnits(units);
      for (const id of dispatch) {
        const unit = byId.get(id);
        liveLeases = acquire(liveLeases, unit);
        running.set(id, (async () => { try { return { id, result: await runUnit(unit) }; } catch { return { id, result: null }; } })());
      }
      continue;
    }
    if (running.size > 0) {
      const settled = await Promise.race(running.values());
      running.delete(settled.id);
      liveLeases = release(liveLeases, settled.id);
      units = applyOutcomes(units, new Map([[settled.id, settled.result]]));
      continue;
    }
    if (poll && pollsUsed < maxPollCycles && progressPossible(units)) {
      pollsUsed++;
      const watching = awaitingUnits(units);
      const merged = [];
      for (const unit of watching) {
        const result = await poll.watch(unit);
        if (classifyMergeWatch(result)) {
          merged.push(unit.id);
          if (typeof poll.onMerged === 'function') await poll.onMerged(unit, result);
        }
      }
      polls.push({ cycle: pollsUsed, watched: watching.map((u) => u.id), merged });
      if (merged.length > 0) { units = markMerged(units, merged); pollsUsed = 0; }
      continue;
    }
    units = markAwaitingMerge(units);
    break;
  }
  return { units, ticks, polls };
}

export const STREAMING_DISPATCH_ENABLED = false;

export async function runSchedule(specs, runUnit, poll, opts) {
  const streaming = opts && typeof opts.streaming === 'boolean' ? opts.streaming : STREAMING_DISPATCH_ENABLED;
  const windowSize = opts && Number.isInteger(opts.window) ? opts.window : undefined;
  return streaming
    ? runScheduleStreaming(specs, runUnit, poll, windowSize)
    : runScheduleTick(specs, runUnit, poll, windowSize);
}
