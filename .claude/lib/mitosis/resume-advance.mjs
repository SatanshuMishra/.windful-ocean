import { selectResumeBuilt } from './parking.mjs';
import { applyBuiltTransition } from './recovery.mjs';

const MODULE = 'resume-advance';

function describe(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return Array.isArray(value) ? 'an array' : typeof value;
}

function requirePlainObject(value, field, why) {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${MODULE}: ${field} must be a non-null, non-array object, ${why}, received ${describe(value)}`);
  }
  return value;
}

function requireArray(value, field, why) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${MODULE}: ${field} must be an array, ${why}, received ${describe(value)}`);
  }
  return value;
}

function requireView(resumed) {
  requirePlainObject(resumed, 'the resume view', 'this module advances that view rather than taking a fresh one');
  requirePlainObject(resumed.manifest, 'the resume view manifest', 'the deltas fold onto it and the divergence check reads the status they set');
  requireArray(resumed.built, 'the resume view built list', 'a unit a prior invocation built is carried forward from it rather than rediscovered');
  requireArray(resumed.shipped, 'the resume view shipped list', 'only the forge probe that produced it may name the merged set, and this module runs no probe');
  return resumed;
}

function requireDelta(delta, index) {
  requirePlainObject(delta, `built delta ${index}`, 'each delta is the record Execute already wrote to the journal');
  if (typeof delta.unitId !== 'string' || delta.unitId.length === 0) {
    throw new TypeError(`${MODULE}: built delta ${index} needs a non-empty unitId string, because the fold applies it to the msp of that name and a delta carrying none would be applied to no unit at all, received ${JSON.stringify(delta.unitId)}`);
  }
  return delta;
}

function requireDeltas(recorded) {
  requireArray(recorded, 'the built deltas Execute recorded', 'they are the only evidence this module has that a unit was built after the view was taken');
  return recorded.map(requireDelta);
}

function unitIdOf(entry) {
  return entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? entry.unitId : null;
}

function builtEntry(entry) {
  return Object.freeze({
    unitId: entry.unitId,
    stage: entry.stage,
    resumePoint: Object.freeze({ ...entry.resumePoint }),
  });
}

export function advanceResume(resumed, recorded) {
  const view = requireView(resumed);
  const deltas = requireDeltas(recorded);
  const manifest = deltas.reduce((folded, delta) => applyBuiltTransition(folded, delta), view.manifest);
  const carried = new Set([...view.built.map(unitIdOf), ...deltas.map((delta) => delta.unitId)]);
  const built = selectResumeBuilt(manifest, view.shipped, null).filter((entry) => carried.has(entry.unitId));
  return Object.freeze({
    manifest,
    built: Object.freeze(built.map(builtEntry)),
    shipped: Object.freeze([...view.shipped]),
  });
}
