import { scopesOverlap } from './wave-planner.mjs';

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

export function acquire(leases, unit) {
  const next = new Map(leases);
  for (const path of unit.fileScope) next.set(path, unit.id);
  return next;
}

export function dispositionOf(outcome) {
  if (outcome && outcome.tag === 'Done') return 'done';
  if (outcome && outcome.tag === 'AwaitingApproval') return 'awaiting';
  return 'parked';
}

export function planTick(units) {
  const byId = indexUnits(units);
  let leases = new Map();
  const dispatch = [];
  for (const unit of units) {
    if (isDispatchable(unit, byId, leases)) {
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

export async function runSchedule(specs, runUnit) {
  let units = buildUnitTable(specs);
  const ticks = [];
  const maxTicks = units.length + 1;
  for (let tick = 0; tick < maxTicks; tick++) {
    const { dispatch } = planTick(units);
    if (dispatch.length === 0) break;
    ticks.push(dispatch);
    units = markDispatched(units, dispatch);
    const byId = indexUnits(units);
    const dispatchUnits = dispatch.map((id) => byId.get(id));
    const results = await joinTick(dispatchUnits, runUnit);
    const outcomes = new Map(dispatch.map((id, i) => [id, results[i]]));
    units = applyOutcomes(units, outcomes);
  }
  return { units, ticks };
}
