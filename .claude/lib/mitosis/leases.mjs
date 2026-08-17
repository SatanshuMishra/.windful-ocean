import { scopesOverlap } from './wave-planner.mjs';
import { emptyFileScopePack, requireFileScopePack } from './msp-file-scope.mjs';
import { BUILD_AHEAD_CAP } from './window.mjs';

const WORKTREE_ISOLATION = 'worktree';
export const SCOPE_FENCE_ISOLATION = 'scope-fence';
const UNIT_ISOLATION_MODES = Object.freeze([WORKTREE_ISOLATION, SCOPE_FENCE_ISOLATION]);

function requireIsolation(spec) {
  if (spec.isolation === undefined || spec.isolation === null) return WORKTREE_ISOLATION;
  if (!UNIT_ISOLATION_MODES.includes(spec.isolation)) {
    throw new Error(`unit ${spec.id} declares the isolation mode ${JSON.stringify(spec.isolation)}, which is not one of ${UNIT_ISOLATION_MODES.join(', ')}; the checkpoint decision reads this field, so an unrecognized mode would either be checkpointed against a worktree the unit never owned or skip a checkpoint the run needs to relaunch from`);
  }
  return spec.isolation;
}

export function makeUnit(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('unit spec must be an object');
  if (!spec.id || typeof spec.id !== 'string') throw new Error('unit spec missing string id');
  const prereqs = spec.prereqs === undefined ? [] : spec.prereqs;
  if (!Array.isArray(prereqs)) throw new Error(`unit ${spec.id} prereqs must be an array`);
  const fileScope = spec.fileScope === undefined || spec.fileScope === null
    ? emptyFileScopePack()
    : requireFileScopePack(spec.fileScope, `unit ${spec.id} fileScope`);
  return Object.freeze({
    id: spec.id,
    state: spec.state || 'planned',
    prereqs: Object.freeze([...prereqs]),
    fileScope,
    isolation: requireIsolation(spec),
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
  return overlapHolder(leases, unit.fileScope.edit, unit.id) === null;
}

export function isBuildable(unit, unitsById, leases, window) {
  if (unit.state === 'done' || unit.state === 'parked' || unit.state === 'awaiting' || unit.state === 'dispatched' || unit.state === 'built') return false;
  for (const pid of unit.prereqs) {
    const prereq = unitsById.get(pid);
    if (!prereq || (prereq.state !== 'built' && prereq.state !== 'awaiting' && prereq.state !== 'done')) return false;
  }
  if (overlapHolder(leases, unit.fileScope.edit, unit.id) !== null) return false;
  if (!window || !Number.isInteger(window.size)) return false;
  if (!Number.isInteger(window.builtUnmergedCount)) return false;
  return window.builtUnmergedCount < window.size;
}

export function acquire(leases, unit) {
  const next = new Map(leases);
  for (const path of unit.fileScope.edit) next.set(path, unit.id);
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
