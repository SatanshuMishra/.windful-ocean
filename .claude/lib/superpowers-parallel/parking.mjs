import { isValidFingerprint } from './remediation.mjs';
import { checkpointRef } from './checkpoint.mjs';

const LEGAL_STAGES = Object.freeze(['plan', 'plan-review', 'parallelize', 'branch', 'execute', 'ship']);

function sanitizeStage(stage) {
  return typeof stage === 'string' && LEGAL_STAGES.includes(stage) ? stage : null;
}

export function ParkRecord({ unitId, stage, diagnosis, request, remediation, resumePoint, triedSet, dependents }) {
  const req = request && typeof request === 'object' ? request : {};
  const rp = resumePoint && typeof resumePoint === 'object' ? resumePoint : {};
  return Object.freeze({
    unitId,
    stage: stage ?? null,
    diagnosis: diagnosis ?? null,
    request: Object.freeze({
      kind: req.kind ?? null,
      what: req.what ?? null,
      detail: req.detail ?? null,
    }),
    remediation: remediation ?? null,
    resumePoint: Object.freeze({
      branch: rp.branch ?? null,
      ref: rp.ref ?? null,
      stage: sanitizeStage(rp.stage) ?? sanitizeStage(stage),
    }),
    triedSet: Object.freeze(Array.isArray(triedSet) ? [...triedSet] : []),
    dependents: Object.freeze(Array.isArray(dependents) ? [...dependents] : []),
  });
}

export function transitiveDependents(msps, unitId) {
  if (!Array.isArray(msps)) return [];
  const blocked = new Set([unitId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const msp of msps) {
      if (blocked.has(msp.id)) continue;
      const prereqs = Array.isArray(msp.dependsOn) ? msp.dependsOn : [];
      if (prereqs.some((p) => blocked.has(p))) {
        blocked.add(msp.id);
        changed = true;
      }
    }
  }
  return msps.map((msp) => msp.id).filter((id) => id !== unitId && blocked.has(id));
}

export function park(manifest, { unitId, stage, diagnosis, request, remediation, resumePoint, triedSet }) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.msps)) {
    throw new Error('park: manifest must be an object with an msps array');
  }
  if (typeof unitId !== 'string' || unitId.length === 0) {
    throw new Error('park: unitId must be a non-empty string');
  }
  if (!manifest.msps.some((msp) => msp.id === unitId)) {
    throw new Error(`park: unit not found in manifest: ${unitId}`);
  }
  const dependents = transitiveDependents(manifest.msps, unitId);
  const record = ParkRecord({ unitId, stage, diagnosis, request, remediation, resumePoint, triedSet, dependents });
  const parkedIds = new Set([unitId, ...dependents]);
  const msps = manifest.msps.map((msp) => {
    if (!parkedIds.has(msp.id)) return msp;
    if (msp.id === unitId) {
      return { ...msp, status: 'parked', triedSet: [...record.triedSet], resumePoint: { ...record.resumePoint } };
    }
    return {
      ...msp,
      status: 'parked',
      triedSet: Array.isArray(msp.triedSet) ? [...msp.triedSet] : [],
      resumePoint: msp.resumePoint && typeof msp.resumePoint === 'object'
        ? { ...msp.resumePoint }
        : { branch: null, ref: null, stage: null },
    };
  });
  const priorParked = Array.isArray(manifest.parked) ? manifest.parked : [];
  return { ...manifest, msps, parked: [...priorParked, record] };
}

export function isShippedUnit(shippedSet, id) {
  if (!shippedSet) return false;
  if (typeof shippedSet.has === 'function') return shippedSet.has(id);
  if (Array.isArray(shippedSet)) return shippedSet.includes(id);
  if (typeof shippedSet === 'object') return Object.prototype.hasOwnProperty.call(shippedSet, id);
  return false;
}

export function selectResumeUnits(manifest, shippedSet) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.msps)) return [];
  const resume = [];
  for (const msp of manifest.msps) {
    if (msp.status !== 'parked') continue;
    if (isShippedUnit(shippedSet, msp.id)) continue;
    const triedSet = (Array.isArray(msp.triedSet) ? msp.triedSet : []).filter((t) => isValidFingerprint(t));
    const resumePoint = msp.resumePoint && typeof msp.resumePoint === 'object'
      ? { branch: msp.resumePoint.branch ?? null, ref: msp.resumePoint.ref ?? null, stage: sanitizeStage(msp.resumePoint.stage) }
      : { branch: null, ref: null, stage: null };
    resume.push({ unitId: msp.id, stage: resumePoint.stage, resumePoint, triedSet });
  }
  return resume;
}

export function selectResumeBuilt(manifest, shippedSet) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.msps)) return [];
  const runId = typeof manifest.logicalRunId === 'string' ? manifest.logicalRunId : null;
  const resume = [];
  for (const msp of manifest.msps) {
    if (msp.status !== 'built') continue;
    if (isShippedUnit(shippedSet, msp.id)) continue;
    let ref = null;
    try {
      ref = checkpointRef(runId, msp.id);
    } catch (err) {
      ref = null;
    }
    const resumePoint = {
      branch: typeof msp.integrationBranch === 'string' ? msp.integrationBranch : null,
      ref,
      stage: 'ship',
    };
    resume.push({ unitId: msp.id, stage: 'ship', resumePoint });
  }
  return resume;
}
