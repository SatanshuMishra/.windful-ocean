export const PROGRESS_ORDER = Object.freeze(['planned', 'built', 'pr-open', 'merged']);

export const DISPOSITION_CLASSES = Object.freeze(['Transient', 'ApproachFixable', 'Unknown', 'NeedsHuman', 'BlockedByPrereq']);

export const LEGAL_STAGES = Object.freeze(['plan', 'plan-review', 'parallelize', 'branch', 'execute', 'ship']);

const EMPTY_RESUME_POINT = Object.freeze({ branch: null, ref: null, stage: null });
const EMPTY_TRIED_SET = Object.freeze([]);

function assertProgressToken(token) {
  if (!PROGRESS_ORDER.includes(token)) {
    throw new TypeError(`unrecognized progress token: ${JSON.stringify(token)}`);
  }
}

export function mergeProgress(current, incoming) {
  assertProgressToken(current);
  assertProgressToken(incoming);
  const currentRank = PROGRESS_ORDER.indexOf(current);
  const incomingRank = PROGRESS_ORDER.indexOf(incoming);
  return currentRank >= incomingRank ? current : incoming;
}

function requireDiagnosis(diagnosis) {
  if (diagnosis === undefined || diagnosis === null) return null;
  if (typeof diagnosis === 'string' && diagnosis.length > 0) return diagnosis;
  throw new TypeError(`disposition diagnosis must be a non-empty string or null: ${JSON.stringify(diagnosis)}`);
}

function requireStage(stage) {
  if (stage === undefined || stage === null) return null;
  if (LEGAL_STAGES.includes(stage)) return stage;
  throw new TypeError(`disposition stage must be a LEGAL_STAGES member or null: ${JSON.stringify(stage)}`);
}

function requireResumePoint(resumePoint) {
  if (resumePoint === undefined || resumePoint === null) return EMPTY_RESUME_POINT;
  if (typeof resumePoint !== 'object' || Array.isArray(resumePoint)) {
    throw new TypeError(`disposition resumePoint must be an object of {branch, ref, stage} or null: ${JSON.stringify(resumePoint)}`);
  }
  return Object.freeze({
    branch: resumePoint.branch ?? null,
    ref: resumePoint.ref ?? null,
    stage: resumePoint.stage ?? null,
  });
}

function requireTriedSet(triedSet) {
  if (triedSet === undefined) return EMPTY_TRIED_SET;
  if (!Array.isArray(triedSet)) {
    throw new TypeError(`disposition triedSet must be an array of strings: ${JSON.stringify(triedSet)}`);
  }
  for (const entry of triedSet) {
    if (typeof entry !== 'string') {
      throw new TypeError(`disposition triedSet must contain only strings, found: ${JSON.stringify(entry)}`);
    }
  }
  return Object.freeze([...triedSet]);
}

export function createDisposition({ class: dispositionClass, diagnosis, stage, resumePoint, triedSet, remediation } = {}) {
  if (!DISPOSITION_CLASSES.includes(dispositionClass)) {
    throw new TypeError(`unrecognized disposition class: ${JSON.stringify(dispositionClass)}`);
  }
  if (remediation !== undefined) {
    throw new TypeError('disposition remediation is forbidden at construction; it is written only by a later remediation step');
  }
  return Object.freeze({
    class: dispositionClass,
    diagnosis: requireDiagnosis(diagnosis),
    stage: requireStage(stage),
    resumePoint: requireResumePoint(resumePoint),
    triedSet: requireTriedSet(triedSet),
    remediation: null,
  });
}

function requireRemediationRecord(remediation) {
  if (remediation === null || remediation === undefined || typeof remediation !== 'object' || Array.isArray(remediation)) {
    throw new TypeError(`disposition remediation must be a non-null, non-array record: ${JSON.stringify(remediation)}`);
  }
  return Object.freeze({ ...remediation });
}

function requireFillableDisposition(disposition) {
  if (disposition === null || disposition === undefined || typeof disposition !== 'object' || Array.isArray(disposition)) {
    throw new TypeError(`disposition to carry a remediation must be a non-null, non-array object: ${JSON.stringify(disposition)}`);
  }
  if (!DISPOSITION_CLASSES.includes(disposition.class)) {
    throw new TypeError(`unrecognized disposition class: ${JSON.stringify(disposition.class)}`);
  }
  return disposition;
}

function absentAsUndefined(value) {
  return value === null || value === undefined ? undefined : value;
}

export function withRemediation(disposition, remediation) {
  const carried = requireFillableDisposition(disposition);
  return Object.freeze({
    class: carried.class,
    diagnosis: requireDiagnosis(carried.diagnosis),
    stage: requireStage(carried.stage),
    resumePoint: requireResumePoint(carried.resumePoint),
    triedSet: requireTriedSet(absentAsUndefined(carried.triedSet)),
    remediation: requireRemediationRecord(remediation),
  });
}

export function startingProgressOf(msp) {
  if (msp && typeof msp.progress === 'string') return msp.progress;
  return 'planned';
}

function sanitizeLegacyStage(stage) {
  return typeof stage === 'string' && LEGAL_STAGES.includes(stage) ? stage : null;
}

export function legacyParkedDisposition(msp) {
  const rp = msp && msp.resumePoint && typeof msp.resumePoint === 'object' && !Array.isArray(msp.resumePoint) ? msp.resumePoint : {};
  const stage = sanitizeLegacyStage(rp.stage);
  const resumePoint = { branch: rp.branch ?? null, ref: rp.ref ?? null, stage };
  const triedSet = msp && Array.isArray(msp.triedSet) ? msp.triedSet : [];
  return createDisposition({ class: 'Unknown', stage, resumePoint, triedSet });
}
