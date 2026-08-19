import { runStage } from './boundary.mjs';
import { composePrompt } from './prompt-registry.mjs';
import { isValidFingerprint, remediationBackoff } from './remediation.mjs';

const MODULE = 'unit-remediation';
const DIAGNOSE = 'diagnose';
const REDISPATCH = 'redispatch';
const REMEDIABLE = 'remediable';
const NEEDS_HUMAN = 'needs-human';
const NOTHING_TRIED = Object.freeze([]);
const INHERITED_KEYS = Object.freeze(['timeoutMs', 'agentType', 'model', 'effort']);

export const IMPLEMENT_STAGE = 'implement';

export const DIAGNOSIS_SCHEMA = Object.freeze({
  type: 'object',
  required: Object.freeze(['verdict']),
  additionalProperties: false,
  properties: Object.freeze({
    verdict: Object.freeze({ type: 'string', enum: Object.freeze([REMEDIABLE, NEEDS_HUMAN]) }),
    mechanism: Object.freeze({ type: 'string' }),
    correctedTask: Object.freeze({ type: 'string' }),
    diagnosis: Object.freeze({ type: 'string' }),
  }),
});

function describe(value) {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'an array' : typeof value;
}

function isRecord(value) {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

function inheritedFields(base) {
  if (!isRecord(base)) return {};
  const carried = {};
  for (const key of INHERITED_KEYS) {
    if (base[key] !== undefined) carried[key] = base[key];
  }
  return carried;
}

function evidenceRecord(evidence) {
  return isRecord(evidence) ? evidence : { detail: describe(evidence) };
}

export function requireRemediationInput(input) {
  if (!isRecord(input)) {
    throw new TypeError(`${MODULE}: the remediation input must be a non-null, non-array object, received ${describe(input)}`);
  }
  if (typeof input.task !== 'string' || input.task.trim() === '') {
    throw new TypeError(`${MODULE}: unit ${JSON.stringify(input.unitId)} carries no task text to remediate against, received ${describe(input.task)}; the diagnosis prompt names the objective the failed attempt was pursuing, and an empty one asks the diagnostician to correct an approach to nothing`);
  }
  return input;
}

function triedList(triedSet) {
  const declared = triedSet instanceof Set ? [...triedSet] : triedSet;
  if (!Array.isArray(declared)) return NOTHING_TRIED;
  return Object.freeze(declared.filter((mechanism) => typeof mechanism === 'string' && mechanism.length > 0));
}

function rejectedMechanismOf(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function diagnoseRequest(input, base) {
  return Object.freeze({
    prompt: composePrompt(DIAGNOSE, {
      unitId: input.unitId,
      stage: input.stage,
      task: input.task,
      evidence: evidenceRecord(input.evidence),
      triedSet: triedList(input.triedSet),
      rejectedMechanism: rejectedMechanismOf(input.rejectedMechanism),
    }),
    schema: DIAGNOSIS_SCHEMA,
    ...inheritedFields(base),
  });
}

function refused(what, detail, envelope) {
  return Object.freeze({ ok: false, kind: DIAGNOSE, what, detail, envelope });
}

function envelopeOf(verdict) {
  return isRecord(verdict) && verdict.envelope !== undefined ? verdict.envelope : null;
}

function correctedTaskOf(structured) {
  return typeof structured.correctedTask === 'string' && structured.correctedTask.trim() !== ''
    ? structured.correctedTask
    : null;
}

export function readDiagnosis(verdict) {
  const envelope = envelopeOf(verdict);
  if (!isRecord(verdict) || verdict.ok !== true) {
    const outcome = isRecord(verdict) ? verdict.outcome : null;
    const detail = isRecord(verdict) && typeof verdict.error === 'string' ? verdict.error : 'no verdict';
    return refused('diagnose-dispatch-failed', `the diagnose child returned ${outcome === null ? 'no verdict at all' : JSON.stringify(outcome)}: ${detail}`, envelope);
  }
  const structured = verdict.structured;
  if (!isRecord(structured)) {
    return refused('diagnosis-missing', `the diagnose child returned ${describe(structured)} where the diagnosis object was required, so the second attempt would carry no correction and would repeat the attempt that just failed`, envelope);
  }
  if (structured.verdict === NEEDS_HUMAN) {
    return refused('diagnosis-needs-human', `the diagnose child judged that only a human can settle this unit, so a second attempt would spend a child on an answer that cannot change`, envelope);
  }
  if (structured.verdict !== REMEDIABLE) {
    return refused('diagnosis-unreadable', `the diagnose child returned the verdict ${JSON.stringify(structured.verdict)}, which is neither ${REMEDIABLE} nor ${NEEDS_HUMAN}, so whether a correction exists cannot be established`, envelope);
  }
  if (!isValidFingerprint(structured.mechanism)) {
    return refused('diagnosis-mechanism-unreadable', `the diagnose child proposed the mechanism ${JSON.stringify(structured.mechanism)}, which is not a "<category>:<mechanism>" fingerprint, so the correction the re-attempt would carry names no mechanism a later attempt could exclude`, envelope);
  }
  return Object.freeze({
    ok: true,
    mechanism: structured.mechanism,
    correctedTask: correctedTaskOf(structured),
    envelope,
  });
}

export function redispatchRequest(input, diagnosis, base) {
  return Object.freeze({
    prompt: composePrompt(REDISPATCH, {
      unitId: input.unitId,
      stage: input.stage,
      task: input.task,
      correctedTask: diagnosis.correctedTask,
      mechanism: diagnosis.mechanism,
      attempt: input.attempt,
      backoffSeconds: remediationBackoff(input.attempt),
    }),
    ...inheritedFields(base),
    ...(isRecord(base) && base.schema !== undefined ? { schema: base.schema } : {}),
  });
}

export async function planRemediatedAttempt(input, base, dispatchPrompt) {
  const validated = requireRemediationInput(input);
  const diagnosis = readDiagnosis(await dispatchPrompt(diagnoseRequest(validated, base)));
  if (!diagnosis.ok) return diagnosis;
  return Object.freeze({ ok: true, request: redispatchRequest(validated, diagnosis, base), envelope: diagnosis.envelope });
}

function requireDispatchPrompt(dispatchPrompt) {
  if (typeof dispatchPrompt !== 'function') {
    throw new TypeError(`${MODULE}: the remediation adapter needs a dispatchPrompt function, because every diagnosis and every corrected re-attempt is a child this module composes and never runs itself, received ${describe(dispatchPrompt)}`);
  }
  return dispatchPrompt;
}

function unreadableDiagnosis(refusal) {
  return Object.freeze({
    verdict: NEEDS_HUMAN,
    request: Object.freeze({ kind: refusal.kind, what: refusal.what, detail: refusal.detail }),
  });
}

export function remediationDeps(input, base, dispatchPrompt) {
  const validated = requireRemediationInput(input);
  const dispatch = requireDispatchPrompt(dispatchPrompt);
  let attempt = 0;
  return Object.freeze({
    diagnose: async (probe) => {
      const asked = isRecord(probe) ? probe : {};
      const diagnosis = readDiagnosis(await dispatch(diagnoseRequest({
        ...validated,
        evidence: asked.evidence === undefined ? validated.evidence : asked.evidence,
        triedSet: asked.triedSet,
        rejectedMechanism: asked.rejectedMechanism,
      }, base)));
      if (!diagnosis.ok) return unreadableDiagnosis(diagnosis);
      return Object.freeze({ mechanism: diagnosis.mechanism, correctedTask: diagnosis.correctedTask });
    },
    redispatch: async (correction) => {
      const asked = isRecord(correction) ? correction : {};
      attempt += 1;
      const request = redispatchRequest(
        { ...validated, attempt },
        { mechanism: asked.mechanism, correctedTask: asked.correctedTask ?? null },
        base,
      );
      return runStage(() => dispatch(request), { attemptNo: attempt });
    },
  });
}
