import { join } from 'node:path';
import { NOT_COMPARABLE_CLASSIFIER } from './boundary-gate.mjs';
import { divergedParents } from './divergence.mjs';
import { LEGAL_STAGES, transitiveDependents } from './parking.mjs';
import { composePrompt } from './prompt-registry.mjs';

const MODULE = 'integrate-plan';

export const INTEGRATED = 'integrated';
export const PARKED = 'parked';
export const DIVERGED = 'diverged';
export const INTEGRATE_STATES = Object.freeze([INTEGRATED, PARKED, DIVERGED]);
export const INTEGRATE_PARK_STAGE = 'execute';
export const BOUNDARY_BASE_SEGMENTS = Object.freeze(['.mitosis', 'boundary']);
export const BOUNDARY_HEAD_SUFFIX = '.head';

const REQUIRED_PORTS = Object.freeze(['boundaryGate', 'dispatchPrompt', 'teardownHeadWorktree']);
const WORKTREE_ISOLATION = 'worktree';
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const GATE_BASE_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._/-]*$/;
const EMPTY = Object.freeze([]);
const NO_RESUME_POINT = Object.freeze({ branch: null, ref: null, stage: null });

function describe(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return Array.isArray(value) ? 'an array' : typeof value;
}

function isRecord(value) {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function mspsOf(manifest) {
  return Array.isArray(manifest.msps) ? manifest.msps.filter(isRecord) : [];
}

function safeGateBase(value) {
  const text = nonEmptyText(value);
  if (text === null || text.includes('..') || !GATE_BASE_PATTERN.test(text)) return null;
  return text;
}

function requirePorts(ports) {
  if (!isRecord(ports)) {
    throw new TypeError(`${MODULE}: the integrate ports must be a non-null, non-array object, received ${describe(ports)}`);
  }
  for (const name of REQUIRED_PORTS) {
    if (typeof ports[name] !== 'function') {
      throw new TypeError(`${MODULE}: the integrate ports need a ${name} function, because this module evaluates no gate and spawns no child of its own, received ${describe(ports[name])}`);
    }
  }
  return ports;
}

function requireBuiltEntry(entry, index) {
  if (!isRecord(entry)) {
    throw new TypeError(`${MODULE}: built entry ${index} must be an object carrying a unitId and a resume point, received ${describe(entry)}`);
  }
  if (!UNIT_ID_PATTERN.test(String(entry.unitId))) {
    throw new TypeError(`${MODULE}: built entry ${index} names the unit ${JSON.stringify(entry.unitId)}, which is not a unit id this phase can key a base worktree path to; an id outside ${UNIT_ID_PATTERN.source} would place the throwaway base tree at a path the caller never wrote`);
  }
  return Object.freeze({
    unitId: entry.unitId,
    resumePoint: isRecord(entry.resumePoint) ? Object.freeze({ ...NO_RESUME_POINT, ...entry.resumePoint }) : NO_RESUME_POINT,
  });
}

function requireConfig(config) {
  if (!isRecord(config)) {
    throw new TypeError(`${MODULE}: the integrate config must be a non-null, non-array object, received ${describe(config)}`);
  }
  if (!Array.isArray(config.built)) {
    throw new TypeError(`${MODULE}: the integrate config needs the built array the resume plan froze, because that array is the complete set of units this phase gates, received ${describe(config.built)}`);
  }
  if (!isRecord(config.manifest)) {
    throw new TypeError(`${MODULE}: the integrate config needs the run manifest, because the topological order and the divergence check are both read from it, received ${describe(config.manifest)}`);
  }
  if (nonEmptyText(config.repoRoot) === null) {
    throw new TypeError(`${MODULE}: the integrate config needs a non-empty repoRoot, because it is the tree the gate collects as HEAD, received ${describe(config.repoRoot)}`);
  }
  if (!RUN_ID_PATTERN.test(String(config.runId))) {
    throw new TypeError(`${MODULE}: the integrate config names the run ${JSON.stringify(config.runId)}, which is not a run id this phase can key a base worktree path to; an id outside ${RUN_ID_PATTERN.source} would place the throwaway base tree at a path the caller never wrote`);
  }
  return Object.freeze({
    built: Object.freeze(config.built.map(requireBuiltEntry)),
    manifest: config.manifest,
    repoRoot: config.repoRoot,
    runId: config.runId,
    quiescent: config.quiescent === true,
    shipped: Object.freeze(Array.isArray(config.shipped) ? config.shipped.filter((id) => nonEmptyText(id) !== null) : []),
    mergedShas: isRecord(config.mergedShas) ? config.mergedShas : Object.freeze({}),
    baseBranch: safeGateBase(config.manifest.baseBranch),
    isolationById: config.isolationById instanceof Map ? config.isolationById : new Map(),
  });
}

export function topologicalOrder(built, manifest) {
  const dependsById = new Map(mspsOf(manifest).map((msp) => [msp.id, Array.isArray(msp.dependsOn) ? msp.dependsOn : []]));
  const builtIds = new Set(built.map((entry) => entry.unitId));
  const placed = new Set();
  const ordered = [];
  let pending = [...built];
  while (pending.length > 0) {
    const ready = pending.filter((entry) => (dependsById.get(entry.unitId) ?? [])
      .every((id) => !builtIds.has(id) || placed.has(id)));
    if (ready.length === 0) {
      throw new TypeError(`${MODULE}: the built units ${pending.map((entry) => entry.unitId).join(', ')} depend on one another in a cycle, so no order over dependsOn exists; gating them in an arbitrary order would key each unit's base to a sibling that has not been integrated yet`);
    }
    for (const entry of ready) {
      ordered.push(entry);
      placed.add(entry.unitId);
    }
    pending = pending.filter((entry) => !placed.has(entry.unitId));
  }
  return Object.freeze(ordered);
}

function parkStage() {
  if (!LEGAL_STAGES.includes(INTEGRATE_PARK_STAGE)) {
    throw new TypeError(`${MODULE}: ${JSON.stringify(INTEGRATE_PARK_STAGE)} is not one of the legal park stages ${LEGAL_STAGES.join(', ')}, and a park recorded at a stage no resume path reads would strand the unit`);
  }
  return INTEGRATE_PARK_STAGE;
}

function outcome(entry, state, boundaryFixes, diagnosis) {
  return Object.freeze({
    unitId: entry.unitId,
    state,
    boundaryFixes,
    diagnosis,
    stage: state === PARKED ? parkStage() : null,
    resumePoint: entry.resumePoint,
  });
}

function requireVerdict(verdict, unitId, which) {
  if (!isRecord(verdict) || typeof verdict.pass !== 'boolean' || typeof verdict.output !== 'string') {
    throw new TypeError(`${MODULE}: ${which} of the boundary gate for unit ${JSON.stringify(unitId)} returned ${describe(verdict)} rather than a verdict carrying a pass boolean and an output string; a verdict nobody can read is a gate the run would report as having passed`);
  }
  return verdict;
}

function boundaryPathOf(settings, unitId, suffix) {
  return join(settings.repoRoot, ...BOUNDARY_BASE_SEGMENTS, settings.runId, `${unitId}${suffix}`);
}

function checkpointRefOf(entry) {
  return safeGateBase(entry.resumePoint.ref);
}

function gateRequest(entry, gateBase, settings) {
  return Object.freeze({
    repoRoot: settings.repoRoot,
    gateBase,
    basePath: boundaryPathOf(settings, entry.unitId, ''),
    headRef: checkpointRefOf(entry),
    headPath: boundaryPathOf(settings, entry.unitId, BOUNDARY_HEAD_SUFFIX),
  });
}

function boundaryFixInput(entry, settings, gateOutput, headPath) {
  return {
    repoRoot: settings.repoRoot,
    baseBranch: settings.baseBranch,
    integrationWorktree: headPath,
    gateOutput,
    isolation: settings.isolationById.get(entry.unitId) ?? WORKTREE_ISOLATION,
  };
}

function dispatchFailure(verdict) {
  if (!isRecord(verdict)) return `the boundary-fix child returned ${describe(verdict)} rather than a dispatch verdict`;
  return `the boundary-fix child returned ${JSON.stringify(verdict.outcome ?? null)}: ${verdict.error ?? 'no reason given'}`;
}

function notComparableRefusal(verdict) {
  if (!Array.isArray(verdict.blocking)) return null;
  const found = verdict.blocking.find((item) => isRecord(item) && item.classifier === NOT_COMPARABLE_CLASSIFIER);
  return found === undefined ? null : (nonEmptyText(found.detail) ?? verdict.output);
}

async function attemptFix(entry, settings, ports, gateOutput) {
  const headPath = boundaryPathOf(settings, entry.unitId, BOUNDARY_HEAD_SUFFIX);
  const dispatched = await ports.dispatchPrompt({
    prompt: composePrompt('boundary-fix', boundaryFixInput(entry, settings, gateOutput, headPath)),
    cwd: headPath,
  });
  return Object.freeze({
    dispatches: 1,
    ran: isRecord(dispatched) && dispatched.ok === true,
    failure: dispatchFailure(dispatched),
  });
}

async function gatedOutcome(entry, request, settings, ports) {
  const first = requireVerdict(await ports.boundaryGate(request), entry.unitId, 'the first pass');
  if (first.pass) return outcome(entry, INTEGRATED, 0, null);
  const structural = notComparableRefusal(first);
  if (structural !== null) {
    return outcome(entry, PARKED, 0, `the gate could not compare this unit against a base distinct from its own tree, and no fix a child could make would change that: ${structural}`);
  }
  const attempt = await attemptFix(entry, settings, ports, first.output);
  if (!attempt.ran) {
    return outcome(entry, PARKED, attempt.dispatches, `the one bounded boundary-fix attempt did not run to a verdict, so the gate was never rechecked: ${attempt.failure}`);
  }
  const recheck = requireVerdict(
    await ports.boundaryGate(Object.freeze({ ...request, cachedBaseCensus: first.baseCensus })),
    entry.unitId,
    'the recheck',
  );
  if (recheck.pass) return outcome(entry, INTEGRATED, attempt.dispatches, null);
  return outcome(entry, PARKED, attempt.dispatches, `the boundary violation survived the one bounded fix attempt: ${recheck.output}`);
}

async function gateUnit(entry, gateBase, settings, ports) {
  const request = gateRequest(entry, gateBase, settings);
  try {
    return await gatedOutcome(entry, request, settings, ports);
  } finally {
    await ports.teardownHeadWorktree({ repoRoot: settings.repoRoot, headPath: request.headPath });
  }
}

async function divergedIds(settings) {
  if (settings.shipped.length === 0) return EMPTY;
  return Object.freeze(await divergedParents(settings.manifest, settings.shipped, settings.mergedShas, {}));
}

function blockedByDivergence(manifest, parentIds) {
  const blocked = new Map();
  for (const parentId of parentIds) {
    for (const dependent of transitiveDependents(mspsOf(manifest), parentId)) {
      if (!blocked.has(dependent)) blocked.set(dependent, parentId);
    }
  }
  return blocked;
}

export function gateBaseChain(ordered, manifest, baseBranch) {
  const dependsById = new Map(mspsOf(manifest).map((msp) => [msp.id, Array.isArray(msp.dependsOn) ? msp.dependsOn : []]));
  const checkpointById = new Map();
  const bases = new Map();
  for (const entry of ordered) {
    const declared = dependsById.get(entry.unitId) ?? [];
    const precursors = [...checkpointById.keys()].filter((id) => declared.includes(id));
    const precursor = precursors.length === 0 ? null : precursors[precursors.length - 1];
    bases.set(entry.unitId, precursor === null ? baseBranch : checkpointById.get(precursor));
    const ref = checkpointRefOf(entry);
    if (ref !== null) checkpointById.set(entry.unitId, ref);
  }
  return bases;
}

function produced(outcomes, divergedParentIds) {
  const ordered = Object.freeze(outcomes);
  const withState = (state) => Object.freeze(ordered.filter((entry) => entry.state === state));
  return Object.freeze({
    integrated: withState(INTEGRATED),
    parked: withState(PARKED),
    diverged: withState(DIVERGED),
    divergedParents: Object.freeze([...divergedParentIds]),
    outcomes: ordered,
  });
}

function unreachedOutcome(entry, blocked, settings) {
  const parent = blocked.get(entry.unitId);
  if (parent !== undefined) {
    return outcome(entry, DIVERGED, 0, `the merged prerequisite ${JSON.stringify(parent)} diverged from what this unit was built against, so this built unit is held rather than gated against a base that no longer describes it`);
  }
  if (settings.baseBranch === null) {
    return outcome(entry, PARKED, 0, `the run manifest declares no base branch the diff-scoped gate could take as its pre-MSP tree, and a gate run against a base nobody declared would compare this unit's findings with an arbitrary one`);
  }
  if (checkpointRefOf(entry) === null) {
    return outcome(entry, PARKED, 0, `this built unit carries no checkpoint ref the gate could materialize as its own tree, and the only head census left would read a tree that never carried this unit's diff, so every finding it introduced would be invisible`);
  }
  return null;
}

export async function integrateBuilt(config, ports) {
  const settings = requireConfig(config);
  const wired = requirePorts(ports);
  if (!settings.quiescent || settings.built.length === 0) return produced(EMPTY, EMPTY);
  const ordered = topologicalOrder(settings.built, settings.manifest);
  const divergedParentIds = await divergedIds(settings);
  const blocked = blockedByDivergence(settings.manifest, divergedParentIds);
  const bases = gateBaseChain(ordered, settings.manifest, settings.baseBranch);
  const outcomes = [];
  for (const entry of ordered) {
    const unreached = unreachedOutcome(entry, blocked, settings);
    outcomes.push(unreached === null ? await gateUnit(entry, bases.get(entry.unitId), settings, wired) : unreached);
  }
  return produced(outcomes, divergedParentIds);
}

export function integrateSummary(plan) {
  return {
    integrated: plan.integrated.map((entry) => entry.unitId),
    parked: plan.parked.map((entry) => entry.unitId),
    diverged: plan.diverged.map((entry) => entry.unitId),
    parkedStages: Object.fromEntries(plan.parked.map((entry) => [entry.unitId, entry.stage])),
    outcomes: plan.outcomes.map((entry) => ({ id: entry.unitId, state: entry.state, boundaryFixes: entry.boundaryFixes })),
  };
}
