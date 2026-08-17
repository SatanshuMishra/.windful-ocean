import { selectResumeBuilt, selectResumeUnits } from './parking.mjs';
import { reconcileShippedSet, resolveResumeTarget } from './recovery.mjs';

const MODULE = 'resume-plan';
const SHIPPED = 'shipped';
const NO_RESUME_POINT = Object.freeze({ branch: null, ref: null, stage: null });

function describe(value) {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'an array' : typeof value;
}

function requirePlainObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${MODULE}: ${field} must be a non-null, non-array object, received ${describe(value)}`);
  }
  return value;
}

function requireUnitSpecs(value) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${MODULE}: the planned unit specs must be an array, because this module reduces that array to the units the run still owes work on, received ${describe(value)}`);
  }
  return value.map((spec, index) => {
    requirePlainObject(spec, `planned unit spec ${index}`);
    if (typeof spec.id !== 'string' || spec.id.length === 0) {
      throw new TypeError(`${MODULE}: planned unit spec ${index} needs a non-empty id string, because the journal records what a prior run settled by id and a spec carrying none could never be matched to its own record, received ${JSON.stringify(spec.id)}`);
    }
    return spec;
  });
}

function requireRunId(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${MODULE}: the run id must be a non-empty string, because a journal is only this run's evidence when it names this run, received ${describe(value)}`);
  }
  return value;
}

function runIdentity(declared, runId) {
  return typeof declared.logicalRunId === 'string' && declared.logicalRunId.length > 0
    ? declared.logicalRunId
    : runId;
}

function recoveredManifest(journal, identity) {
  if (journal === null || journal === undefined) return null;
  const target = resolveResumeTarget(journal, identity);
  return target.found === true ? target.manifest : null;
}

function mspsOf(manifest) {
  return Array.isArray(manifest.msps) ? manifest.msps : [];
}

function shippedByStatus(manifest) {
  return new Set(mspsOf(manifest)
    .filter((msp) => msp !== null && typeof msp === 'object' && !Array.isArray(msp))
    .filter((msp) => typeof msp.id === 'string' && msp.status === SHIPPED)
    .map((msp) => msp.id));
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function probeValues(manifest, repoSlug) {
  const ownerRepo = nonEmptyText(repoSlug);
  const baseBranch = nonEmptyText(manifest.baseBranch);
  const sourcePrefix = nonEmptyText(manifest.sourcePrefix);
  if (ownerRepo === null || baseBranch === null || sourcePrefix === null) return null;
  return Object.freeze({ ownerRepo, baseBranch, sourcePrefix, repoHost: nonEmptyText(manifest.repoHost) });
}

async function shippedIds(manifest, plannedIds, request) {
  const claimed = [...shippedByStatus(manifest)].filter((id) => plannedIds.has(id));
  if (claimed.length === 0) return new Set();
  const probe = probeValues(manifest, request.repoSlug);
  if (probe === null) return new Set();
  const merged = await request.reconcile(probe);
  if (!Array.isArray(merged)) return new Set();
  return new Set(reconcileShippedSet(merged, probe.sourcePrefix, probe.ownerRepo, probe.repoHost).keys());
}

function resumePointOf(source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return NO_RESUME_POINT;
  return Object.freeze({
    branch: source.branch === undefined ? null : source.branch,
    ref: source.ref === undefined ? null : source.ref,
    stage: source.stage === undefined ? null : source.stage,
  });
}

function resumeEntry(unitId, recorded) {
  const source = recorded === undefined || recorded === null ? {} : recorded;
  return Object.freeze({
    unitId,
    stage: source.stage === undefined ? null : source.stage,
    resumePoint: resumePointOf(source.resumePoint),
    triedSet: Object.freeze(Array.isArray(source.triedSet) ? [...source.triedSet] : []),
  });
}

function reducedSpec(spec, retained) {
  if (!Array.isArray(spec.prereqs)) return spec;
  const kept = spec.prereqs.filter((id) => retained.has(id));
  if (kept.length === spec.prereqs.length) return spec;
  return Object.freeze({ ...spec, prereqs: Object.freeze(kept) });
}

function entriesWithin(entries, planned) {
  return entries.filter((entry) => planned.has(entry.unitId)).map((entry) => resumeEntry(entry.unitId, entry));
}

function requireReconcile(value) {
  if (typeof value !== 'function') {
    throw new TypeError(`${MODULE}: the resume request needs a reconcile function, because a manifest claiming a unit shipped is a local claim and only the merged set observed from the forge may retire that unit work, received ${describe(value)}`);
  }
  return value;
}

export async function planResume(request) {
  requirePlainObject(request, 'the resume request');
  const planned = requireUnitSpecs(request.specs);
  const runId = requireRunId(request.runId);
  requireReconcile(request.reconcile);
  const declared = requirePlainObject(request.manifest, 'the planned run manifest');
  const recovered = recoveredManifest(request.journal, runIdentity(declared, runId));
  const manifest = recovered === null ? declared : recovered;
  const plannedIds = new Set(planned.map((spec) => spec.id));
  const shipped = await shippedIds(manifest, plannedIds, request);
  const built = entriesWithin(selectResumeBuilt(manifest, shipped, null), plannedIds);
  const parked = entriesWithin(selectResumeUnits(manifest, shipped), plannedIds);
  const parkedById = new Map(parked.map((entry) => [entry.unitId, entry]));
  const settled = new Set([...shipped, ...built.map((entry) => entry.unitId)]);
  const outstanding = planned.filter((spec) => !settled.has(spec.id));
  const retained = new Set(outstanding.map((spec) => spec.id));
  return Object.freeze({
    restarted: recovered === null,
    manifest,
    specs: Object.freeze(outstanding.map((spec) => reducedSpec(spec, retained))),
    resumed: Object.freeze(outstanding.map((spec) => parkedById.get(spec.id) ?? resumeEntry(spec.id, undefined))),
    parked: Object.freeze(parked),
    built: Object.freeze(built),
    shipped: Object.freeze([...plannedIds].filter((id) => shipped.has(id))),
  });
}

export function resumeSummary(plan) {
  return {
    restarted: plan.restarted,
    pending: plan.specs.map((spec) => spec.id),
    parked: plan.parked.map((entry) => entry.unitId),
    built: plan.built.map((entry) => entry.unitId),
    shipped: [...plan.shipped],
  };
}
